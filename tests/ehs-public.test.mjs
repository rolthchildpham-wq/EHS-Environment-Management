import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('Public Viewer uses only explicitly published snapshots',()=>{
 const viewer=read('public/ehs-public-viewer.js');
 const publisher=read('public/ehs-public-publish.js');
 assert.match(viewer,/getDoc\(doc\(db,'public_reports','catalog'\)\)/);
 assert.match(viewer,/getDoc\(doc\(db,'public_reports',year\)\)/);
 assert.doesNotMatch(viewer,/collection\(db,'operations'/);
 assert.doesNotMatch(viewer,/getDocs\(/);
 assert.match(publisher,/confirm\('Công bố dữ liệu Dashboard/);
 assert.match(publisher,/mismatches\.length/);
});
test('Firestore public read excludes raw records and membership',()=>{
 const rules=read('firestore.rules');
 const pub=rules.slice(rules.indexOf('match /public_reports/{year}'),rules.indexOf('match /settings/{id}'));
 assert.match(pub,/allow get: if admin\(\) \|\| resource\.data\.get\('published', false\) == true/);
 assert.match(pub,/allow list: if false;/);
 assert.match(pub,/allow create, update: if admin\(\)/);
 assert.match(rules,/match \/operations\/\{id\} \{\s*allow read: if activeMember\(\)/);
 assert.match(rules,/match \/records\/\{id\} \{\s*allow read: if activeMember\(\)/);
});
test('Excel reimport does not silently skip changed records',()=>{
 const ops=read('public/ehs-operations.js');
 assert.match(ops,/previousDocs/);
 assert.match(ops,/batch\.set\(refs\[j\],recordToDb\(r,importId,prior\)\)/);
 assert.match(ops,/const changed=fields\.some/);
});