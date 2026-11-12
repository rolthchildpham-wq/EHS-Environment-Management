import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync('firestore.rules','utf8');

function tokens(source){
 let state='code',out='',escaped=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(state==='line'){if(c==='\n'){state='code';out+='\n'}continue}
  if(state==='block'){if(c==='*'&&next==='/'){state='code';i++}continue}
  if(state==='string'){
   if(escaped){escaped=false;continue}
   if(c==='\\'){escaped=true;continue}
   if(c==="'"){state='code';out+="''"}continue;
  }
  if(c==='/'&&next==='/'){state='line';i++;continue}
  if(c==='/'&&next==='*'){state='block';i++;continue}
  if(c==="'"){state='string';continue}
  out+=c;
 }
 if(state==='string'||state==='block')throw new Error('Unterminated Firestore string or comment');
 return out;
}
test('Rules brackets and parentheses are balanced',()=>{
 const cleaned=tokens(rules),stack=[],pairs={')':'(',']':'[','}':'{'};
 for(const c of cleaned){
  if('({['.includes(c))stack.push(c);
  if(')}]'.includes(c))assert.equal(stack.pop(),pairs[c], 'mismatched closing '+c);
 }
 assert.deepEqual(stack,[]);
});
test('GHG rules must have complete date and factor-year regex',()=>{
 const ghg=rules.slice(rules.indexOf('match /ghg_activities/{id}'),rules.indexOf('match /settings/{id}'));
 assert.ok(ghg.includes("matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')"));
 assert.ok(ghg.includes("matches('^[0-9]{4}$')"));
 assert.ok(ghg.includes('allow update, delete: if false;'));
 assert.ok(!ghg.includes('match /{document=**}'));
});
