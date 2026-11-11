import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkbook,detectSheet} from '../public/ehs-excel-adapters.js';
import {reconcile} from '../public/ehs-financial-reconcile.js';

globalThis.window={XLSX:{utils:{sheet_to_json:(s)=>s.rows},SSF:{parse_date_code:()=>null}}};
const make=(rows)=>({rows});
function sampleWorkbook(){
 const main=Array.from({length:23},()=>[]);
 main[2][3]=40;main[3][3]=70;
 main[8][3]=20;main[9][3]=200;
 main[10][3]='~10';main[11][3]=100;
 main[12][3]=30;main[13][3]=300;
 main[14][3]=15;main[15][3]=150;
 const water=Array.from({length:22},()=>[]);
 water[5][0]='NaOH';water[5][1]='kg';water[5][2]=20;water[5][6]=5;water[5][7]=100;
 water[11][0]='Điện';water[11][1]='kWh';water[11][2]=2;water[11][6]=450;water[11][7]=900;
 water[20][7]=1000;water[21][7]=1000/70;
 const green=Array.from({length:24},()=>[]);
 green[18][0]='Nhân công';green[18][1]='VND';green[18][2]=10;
 green[18][4]=30;green[18][5]=300;green[23][5]=300;
 return {SheetNames:[
  'A.TK Rác_XLNT 2025 (Hàng tháng)',
  'A.3 Chi Phí Nước Thải污水处理费',
  'C.Chi Phí Cây xanh绿化养护费用'
 ],Sheets:{
  'A.TK Rác_XLNT 2025 (Hàng tháng)':make(main),
  'A.3 Chi Phí Nước Thải污水处理费':make(water),
  'C.Chi Phí Cây xanh绿化养护费用':make(green)
 }};
}
test('recognizes actual official management sheet names',()=>{
 assert.equal(detectSheet('C.Chi Phí Cây xanh绿化养护费用'),'green_cost_full');
 assert.equal(detectSheet('A.3 Chi Phí Nước Thải污水处理费'),'water_cost_full');
 assert.equal(detectSheet('A.TK Rác_XLNT 2025 (Hàng tháng)'),'monthly_reference');
});
test('preserves blank Excel rows and reads first NaOH cost',()=>{
 const data=parseWorkbook(sampleWorkbook(),'sample.xlsx',2026).items;
 assert.equal(data.find(x=>x.kind==='water_cost_month'&&x.name==='NaOH')?.quantity,100);
 assert.equal(data.find(x=>x.kind==='water_cost_total')?.quantity,1000);
 assert.equal(data.find(x=>x.kind==='green_cost_total')?.quantity,300);
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='industrial_cost')?.quantity,200);
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='scrap_revenue')?.quantity,150);
});
test('uses official totals not double counting details',()=>{
 const records=parseWorkbook(sampleWorkbook(),'sample.xlsx',2026).items.map(x=>({...x,importId:'batch1',createdAt:{seconds:1}}));
 const summary=reconcile(records,'2026-01-01','2026-01-31');
 const jan=summary.months[0];
 assert.equal(jan.waterCost,1000);
 assert.equal(jan.greenCost,300);
 assert.equal(jan.industrialCost,200);
 assert.equal(jan.hazardousCost,300);
 assert.equal(jan.domesticCost,100);
 assert.equal(jan.wasteCost,600);
 assert.equal(jan.revenue,150);
 assert.equal(jan.costWaterPerM3,1000/70);
 assert.equal(summary.issues.length,0);
});
test('shows discrepancy without replacing official total',()=>{
 const rows=parseWorkbook(sampleWorkbook(),'sample.xlsx',2026).items
 .filter(x=>!(x.kind==='water_cost_month'&&x.name==='NaOH'))
 .map(x=>({...x,importId:'batch1',createdAt:{seconds:1}}));
 const r=reconcile(rows,'2026-01-01','2026-01-31');
 assert.equal(r.months[0].waterCost,1000);
 assert.equal(r.issues.find(x=>x.type==='water_cost')?.difference,100);
});
