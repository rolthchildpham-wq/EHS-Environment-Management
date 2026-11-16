import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8');
const app=readFileSync('public/app.js','utf8');
test('Overview owns its global date and comparison filters',()=>{
 const main=html.indexOf('<main>'),dashboard=html.indexOf('<section id="dashboard"'),records=html.indexOf('<section id="records"');
 const from=html.indexOf('id="from"'),comparison=html.indexOf('id="comparison"');
 assert.ok(main>=0 && dashboard>main && from>dashboard && from<records);
 assert.ok(comparison>dashboard && comparison<records);
 assert.ok(!html.slice(main,dashboard).includes('id="from"'));
});
test('Journal detail has local year and month selectors plus visible date columns',()=>{
 const journal=html.slice(html.indexOf('<section id="records"'),html.indexOf('<section id="finance"'));
 for(const id of ['recordYear','recordMonth','recordRows'])assert.ok(journal.includes('id="'+id+'"'),id);
 for(const col of ['<th>Ngày</th>','<th>Tháng</th>','<th>Năm</th>'])assert.ok(journal.includes(col),col);
 assert.match(journal,/id="qrStockMount"/);
});
test('Journal uses all loaded records, not dashboard global date range',()=>{
 assert.match(app,/function journalRows\(\)/);
 assert.match(app,/return \[\.\.\.data,\.\.\.reviewData\]\.filter/);
 assert.match(app,/return journalRows\(\)\.filter/);
 assert.match(app,/refreshJournalPeriods\(\)/);
 assert.match(app,/el\('recordYear'\)\.onchange/);
 assert.match(app,/el\('recordMonth'\)\.onchange/);
});
