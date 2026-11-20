import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const member=readFileSync('public/member-admin.js','utf8');
const browser=readFileSync('tests/ehs-hub-browser-preview.mjs','utf8');
const index=readFileSync('public/index.html','utf8');
test('member and invite change history includes previous and next values',()=>{
 assert.match(member,/String\(existing\[k\]/);
 assert.match(member,/String\(change\[k\]\)/);
 assert.match(member,/detail\|\|description/);
});
test('Hub smoke checks visible cards while hidden QR shortcut remains hidden',()=>{
 assert.match(index,/id="hubWasteWeighQr"[^>]*hidden/);
 assert.match(browser,/#hubCards \.ehs-hub-card:visible/);
 assert.match(browser,/#hubWasteWeighQr/);
});
