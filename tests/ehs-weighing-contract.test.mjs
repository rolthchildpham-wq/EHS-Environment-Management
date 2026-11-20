import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('public/weighing/index.html','utf8');
const app=readFileSync('public/weighing/weighing.js','utf8');
const rules=readFileSync('firestore.rules','utf8');
const ehs=readFileSync('public/app.js','utf8');
const hub=readFileSync('public/index.html','utf8');
test('QR weighing workflow has persistent login, repeated weights, category switch and tare',()=>{
 for(const id of ['weightInput','addWeight','category','changeType','typeDialog','tare','saveTare','gross','net','pending','qrCode'])assert.ok(page.includes('id="'+id+'"'),id);
 for(const marker of ['browserLocalPersistence','runTransaction(','loadCurrent()','saveTare()','loadPending()',"url.searchParams.set('type',category)",'status:\x27pending\x27'])assert.ok(app.includes(marker),marker);
});
test('Approved waste batch totals flow into journal only after approval',()=>{
 assert.match(ehs,/loadApprovedWasteWeighing\(\)/);
 assert.match(ehs,/where\('status','==','approved'\)/);
 assert.match(ehs,/source:\x27qr-weigh-approved\x27/);
 assert.match(hub,/href="weighing\/"/);
});
test('Firestore weighing writes require EHS authorization and lock approved batches',()=>{
 assert.match(rules,/match \/waste_weigh_entries\/\{entryId\}/);
 assert.match(rules,/match \/waste_weigh_batches\/\{batchId\}/);
 assert.match(rules,/allowed\(\x27waste_weigh\x27\)/);
 assert.match(rules,/getAfter\(/);
 assert.match(rules,/resource\.data\.status == \x27pending\x27/);
 assert.match(rules,/request\.resource\.data\.status == \x27approved\x27/);
 assert.match(rules,/allow delete: if false;/);
});

test('QR entry is a minimal full-viewport kiosk and resets after each OK',()=>{
 for(const id of ['kioskHeader','kioskType','kioskChangeType','pendingSync','weighDetail'])assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(page,/body\.qr-entry #session\{min-height:100dvh/);
 assert.match(page,/body\.qr-entry #weighDetail,body\.qr-entry \.advanced-only\{display:none!important\}/);
 assert.match(app,/const kiosk=params\.has\('type'\)/);
 assert.match(app,/\$\('addWeight'\)\.textContent=kiosk\?'OK'/);
 assert.match(app,/\$\('weightInput'\)\.value=''/);
 assert.match(app,/void flushQueue\(\)/);
});
test('Local queued readings are idempotent and never represented as committed while quota is exhausted',()=>{
 assert.match(app,/localStorage\.setItem/);
 assert.match(app,/if\(entry\.exists\(\)\)return/);
 assert.match(app,/readQueue\(\)\.filter\(p=>p\.id!==x\.id\)/);
 assert.match(app,/e\?\.code==='resource-exhausted'/);
 assert.match(app,/CHƯA đồng bộ Firebase/);
 assert.match(app,/Firebase hết hạn mức/);
 assert.match(app,/quotaFailures=Math\.min\(quotaFailures\+1,6\)/);
 assert.doesNotMatch(app,/await loadCurrent\(\);\$\('weightInput'\)\.focus\(\)/);
});

test('Admin waste types use an Excel-style table instead of pipe-delimited textarea',()=>{
 for(const id of ['catalogRows','catalogAdd','saveCatalog','catalogMessage'])assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(page,/<th>Tên loại rác<\/th>/);
 assert.match(page,/<th>Nhóm<\/th>/);
 assert.match(page,/<th>Mã loại rác \(QR\)<\/th>/);
 assert.doesNotMatch(page,/<textarea id="catalog"/);
 assert.match(app,/function addCatalogRow\(/);
 assert.match(app,/function readCatalogRows\(/);
 assert.match(app,/function renderCatalogRows\(/);
 assert.match(app,/new Set\(next\.map\(x=>x\.code\)\)/);
 assert.match(app,/setDoc\(doc\(db,'settings','waste_weigh_catalog'\)/);
});
