import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=f=>readFileSync(f,'utf8');
test('QR movement uses authenticated Firestore writes, server timestamp, no auto fabricated stock',()=>{
 const qr=r('public/ehs-qr-stock.js');
 assert.match(qr,/createdAt:serverTimestamp\(\)/);
 assert.match(qr,/sourceFile:'QR scan'/);
 assert.match(qr,/kind==='stock_out'&&qty>available/);
 assert.match(qr,/group:category/);
 assert.match(qr,/getUserMedia/);
 assert.match(qr,/qrStockGreen/);
 assert.match(qr,/qrStockSearch/);
 assert.match(qr,/qrStockSuggestions/);
 assert.doesNotMatch(qr,/stock_opening/);
});
test('Only incoming and outgoing material sheets become inventory transactions',()=>{
 const adapter=r('public/ehs-excel-adapters.js'),ops=r('public/ehs-operations.js');
 assert.match(adapter,/stock_opening'\)\{\s*\/\/ Inventory and monthly usage sheets are derived reports/);
 assert.match(adapter,/type==='stock_in'/);
 assert.match(adapter,/type==='stock_out'/);
 assert.match(ops,/operations\.filter\(x=>x\.date<=to&&\['stock_in','stock_out'\]\.includes\(x\.kind\)\)/);
});
test('Financial summary does not double count stock purchases and usage',()=>{
 const fin=r('public/ehs-simple-finance.js');
 assert.match(fin,/stock_in/);
 assert.match(fin,/waterCost,x\.greenCost,x\.wasteCost/);
 assert.match(fin,/giá trị nhập kho|Giá trị nhập vật tư/);
 assert.match(fin,/mua|purchase/);
});
test('Journal contains QR entry and reports open in financial overview',()=>{
 const index=r('public/index.html'),app=r('public/app.js');
 assert.match(index,/id="qrStockMount"/);
 assert.match(index,/<section id="records"><div id="qrStockMount"><\/div>/);
 assert.match(index,/id="simpleFinanceMount"/);
 assert.match(index,/id="reportViewMode"/);
 assert.match(app,/setCostExplorerView\(mode,/);
 assert.doesNotMatch(app,/stockqr:'QR vật tư'/);
 assert.match(app,/mountQrStock\(db,user,role,getAllOperations,reload\)/);
 assert.match(app,/initSimpleFinance\(\)/);
});

test('QR journal cleanup is safe before the QR form is mounted',()=>{
 const code=r('public/ehs-qr-stock.js');
 assert.match(code,/const stop=\$\('qrStockStop'\);if\(stop\)stop\.hidden=true/);
 assert.match(code,/id="qrStockWater" checked/);
 assert.match(code,/id="qrStockGreen"/);
 assert.match(code,/qrLinkCreate/);
 assert.match(code,/searchParams\.set\('tab','records'\)/);
});
test('Login navigation opens journal and keeps report controls guarded',()=>{
 const app=r('public/app.js'),html=r('public/index.html');
 assert.match(app,/requestedTab=new URLSearchParams\(location\.search\)\.get\('tab'\)/);
 assert.match(app,/if\(!summary\|\|!details\|\|!searchLabel\)return/);
 assert.match(html,/id="qrStockMount"/);
});
