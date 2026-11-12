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
