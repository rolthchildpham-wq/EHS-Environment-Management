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
 assert.match(ehs,/x\.status===\x27approved\x27/);
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
