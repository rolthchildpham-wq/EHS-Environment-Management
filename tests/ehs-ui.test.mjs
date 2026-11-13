import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('factory map includes proportional image, coordinate pins, notes and shared persistence',()=>{
 const html=read('public/index.html');
 const map=read('public/factory-map.js');
 assert.match(html,/id="factoryMapImage"/);
 assert.match(html,/object-fit:contain/);
 assert.match(html,/id="mapAnnotations"/);
 assert.match(html,/id="mapPinRows"/);
 assert.match(map,/factoryMapImage.*getBoundingClientRect/);
 assert.match(map,/data-pin/);
 assert.match(map,/settings','factoryMap'/);
});
test('global repeat notice no longer appears in every EHS tab',()=>{
 const html=read('public/index.html');
 assert.equal((html.match(/id="notice"/g)||[]).length,1);
 const index=html.indexOf('id="notice"'),dashboard=html.indexOf('<section id="dashboard"'),end=html.indexOf('<section id="records"');
 assert.ok(index>dashboard && index<end);
});
test('greenhouse gas reporting requires traceable user supplied emission factor',()=>{
 const code=read('public/ehs-compliance.js');
 const rules=read('firestore.rules');
 assert.match(code,/factorSource/);
 assert.match(code,/factorYear/);
 assert.match(code,/x\.quantity\*x\.factor\/1000/);
 assert.match(rules,/match \/ghg_activities\/\{id\}/);
 assert.match(rules,/request\.resource\.data\.factorSource\.size\(\) > 0/);
});

test('cost explorer is prominent and connected to authenticated operations',()=>{
 const html=read('public/index.html'),app=read('public/app.js'),explorer=read('public/ehs-cost-detail.js');
 assert.match(html,/<section id="reports"><div id="costExplorerMount"><\/div>/);
 assert.match(html,/Thiết kế bởi BacPham/);
 assert.match(app,/initCostExplorer\(\)/);
 assert.match(app,/setCostExplorerRecords\(getAllOperations\(\)\)/);
 for(const term of ['costExplorerMonth','costExplorerType','costExplorerRows','consumedQuantity','consumedUnit','Xuất chi tiết A.3'])
  assert.ok(explorer.includes(term),term);
});
test('financial source parser preserves amount and monthly quantity units',()=>{
 const adapter=read('public/ehs-excel-adapters.js'),rules=read('firestore.rules'),ops=read('public/ehs-operations.js');
 for(const k of ['consumedQuantity','consumedUnit','nameVi','nameZh','costGroup','cost-detail-v3']){
  assert.ok(adapter.includes(k),'adapter '+k);
  if(k!=='nameZh')assert.ok(ops.includes(k),'persist '+k);
 }
 for(const k of ['consumedQuantity','consumedUnit','costGroup','nameVi'])
  assert.ok(rules.includes("'"+k+"'"),'rules '+k);
});

test('premium dashboard layout retains all original data-driven charts and business functions',()=>{
 const html=read('public/index.html'),app=read('public/app.js'),css=read('public/dashboard-v3.css');
 for(const id of ['wasteChart','waterChart','categoryChart','moneyChart','stats','executiveInsights','dashboardYear','from','to','tabs','opsMount','costExplorerMount','mapPinRows','memberAdminMount','resetDataMount'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const keyword of ['.ehs-hero','.tabs','.stat','.ehs-insight-grid','@media(max-width:620px)'])
  assert.ok(css.includes(keyword),keyword);
 assert.match(app,/function renderExecutiveInsights/);
 assert.match(app,/renderExecutiveInsights\(r\)/);
 assert.match(app,/function updateYearOptions/);
 assert.match(app,/initFactoryMap\(\);initCompliance\(\);initCostExplorer\(\);/);
});

test('V3.1 waste donut uses unique palette colors for each category and synchronized legend',()=>{
 const app=read('public/app.js');
 assert.match(app,/const categoryPalette=\[/);
 assert.match(app,/labels\.map\(\(_,j\)=>categoryPalette\[j%categoryPalette\.length\]\)/);
 assert.match(app,/borderColor:isDoughnut\?'#ffffff'/);
 assert.match(app,/chart\('categoryChart','doughnut'/);
});
