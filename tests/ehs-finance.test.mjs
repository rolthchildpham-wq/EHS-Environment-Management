import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkbook,detectSheet} from '../public/ehs-excel-adapters.js';
import {reconcile} from '../public/ehs-financial-reconcile.js';

globalThis.window={XLSX:{utils:{sheet_to_json:(s)=>s.rows},SSF:{parse_date_code:()=>null}}};
const make=(rows)=>({rows});
function sampleWorkbook(){
 const main=Array.from({length:23},()=>[]);
 main[2][1]='污水處理量';main[2][2]='nước thải Sản Xuất đầu vào (m3)';
 main[3][1]='污水排放';main[3][2]='nước thải đầu ra (m3)';
 main[6][2]='Chi phí hóa chất xử lý đầu vào (VNĐ/m3)';
 main[7][2]='Chi phí điện năng (VND)';
 main[8][1]='工業垃圾';main[8][2]='công nghiệp khối lượng rác CN (kg)';
 main[9][2]='Chi phí (VND)';
 main[10][1]='生活垃圾';main[10][2]='khối lượng rác sinh hoạt (kg)';
 main[11][2]='Chi phí (VND)';
 main[12][1]='危害垃圾';main[12][2]='khối lượng rác NH (kg)';
 main[13][2]='Chi phí (VND)';
 main[14][1]='回收垃圾';main[14][2]='khối lượng phế liệu (kg)';
 main[15][2]='tiền thu (VND)';
 main[19][1]='Tổng Chi phí xử lý nước thải (Toàn bộ hóa chất)';
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
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='water_in')?.quantity,40);
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='water_out')?.quantity,70);
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='water_out')?.sourceRow,4);
 assert.equal(data.find(x=>x.kind==='monthly_master'&&x.name==='industrial_cost')?.spec,'master-map-v2');
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
 assert.equal(jan.wasteNet,-450);
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

test('expense with negative signed Excel source remains a cost and scrap remains income',()=>{
 const wb=sampleWorkbook();
 wb.Sheets['A.TK Rác_XLNT 2025 (Hàng tháng)'].rows[9][3]=-200;
 const records=parseWorkbook(wb,'sample.xlsx',2026).items;
 const expense=records.find(x=>x.kind==='monthly_master'&&x.name==='industrial_cost');
 const scrap=records.find(x=>x.kind==='monthly_master'&&x.name==='scrap_revenue');
 assert.equal(expense.quantity,200);
 assert.equal(expense.group,'expense');
 assert.equal(scrap.quantity,150);
 assert.equal(scrap.group,'income');
 const summary=reconcile(records,'2026-01-01','2026-01-31').months[0];
 assert.equal(summary.industrialCost,200);
 assert.equal(summary.revenue,150);
 assert.equal(summary.wasteNet,-450);
});

test('old wrong-row A.TK documents are excluded; corrected reimport is authoritative',()=>{
 const original=parseWorkbook(sampleWorkbook(),'sample.xlsx',2026).items;
 const all=original.map(x=>({...x,importId:'corrected-2026',createdAt:{seconds:2}}));
 const shifted={
   kind:'monthly_master',date:'2026-01-01',name:'water_in',
   quantity:70,sourceRow:3,sourceSheet:'A.TK Rác_XLNT 2025 (Hàng tháng)',
   sourceFile:'sample.xlsx',spec:'',createdAt:{seconds:1},group:'management_master'
 };
 const legacyOnly=reconcile([shifted],'2026-01-01','2026-01-31');
 assert.equal(legacyOnly.legacyCount,1);
 assert.equal(legacyOnly.months.length,0);
 const corrected=reconcile([...all,shifted],'2026-01-01','2026-01-31');
 assert.equal(corrected.legacyCount,1);
 assert.equal(corrected.months[0].waterIn,40);
 assert.equal(corrected.months[0].waterOut,70);
 assert.equal(corrected.months[0].industrialKg,20);
 assert.equal(corrected.months[0].industrialCost,200);
 assert.equal(corrected.months[0].revenue,150);
});

test('A.3 and C imports retain original monthly consumption and bilingual row name',()=>{
 const wb=sampleWorkbook();
 wb.Sheets['A.3 Chi Phí Nước Thải污水处理费'].rows[5][0]='Hóa chất NaOH (1,23%)\n氢氧化钠溶液';
 wb.Sheets['A.3 Chi Phí Nước Thải污水处理费'].rows[5][6]=125;
 wb.Sheets['C.Chi Phí Cây xanh绿化养护费用'].rows[18][0]='Lương nhân công bảo dưỡng\n绿化养护人员工资';
 const data=parseWorkbook(wb,'test.xlsx',2026).items;
 const water=data.find(x=>x.kind==='water_cost_month'&&x.sourceRow===6);
 const green=data.find(x=>x.kind==='green_cost_detail'&&x.sourceRow===19);
 assert.equal(water.quantity,100);
 assert.equal(water.consumedQuantity,125);
 assert.equal(water.consumedUnit,'kg');
 assert.equal(water.costGroup,'Hóa chất');
 assert.equal(water.nameVi,'Hóa chất NaOH (1,23%)');
 assert.equal(water.nameZh,'氢氧化钠溶液');
 assert.equal(water.spec,'cost-detail-v3');
 assert.equal(green.consumedQuantity,30);
 assert.equal(green.consumedUnit,'VND');
 assert.equal(green.nameZh,'绿化养护人员工资');
});
