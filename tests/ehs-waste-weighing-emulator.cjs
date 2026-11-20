'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,setDoc,serverTimestamp,runTransaction,getDoc}=require('firebase/firestore');
const batchId='2026-11-19_ctnh-metal-packaging';
const batchPath='waste_weigh_batches/'+batchId;
const read=async(db)=>getDoc(doc(db,batchPath));
async function addReading(db,uid,value,tare=0){
 const b=doc(db,batchPath),e=doc(collection(db,'waste_weigh_entries'));
 await runTransaction(db,async tx=>{
  const old=await tx.get(b),gross=Math.round(((old.exists()?old.data().gross:0)+value)*1000)/1000;
  if(old.exists())tx.update(b,{gross,count:old.data().count+1,tare:Math.round((old.data().tare+tare)*1000)/1000,lastEntryId:e.id,updatedAt:serverTimestamp()});
  else tx.set(b,{date:'2026-11-19',code:'ctnh-metal-packaging',name:'Bao bì kim loại thải',
   group:'CTNH',gross,count:1,tare,lastEntryId:e.id,status:'pending',
   createdBy:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  tx.set(e,{batchId,date:'2026-11-19',code:'ctnh-metal-packaging',value,tare,createdBy:uid,createdAt:serverTimestamp()});
 });
}
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-ehs-permission-gate',
  firestore:{host:'127.0.0.1',port:8084,rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,'members/editor'),{role:'editor',active:true});
   await setDoc(doc(db,'members/admin'),{role:'admin',active:true});
   await setDoc(doc(db,'members/viewer'),{role:'viewer',active:true});
  });
  const editor=env.authenticatedContext('editor').firestore();
  const admin=env.authenticatedContext('admin').firestore();
  const viewer=env.authenticatedContext('viewer').firestore();
  await assertSucceeds(addReading(editor,'editor',38.7,1.2));
  await assertSucceeds(addReading(editor,'editor',25.4,0.8));
  let b=(await read(editor)).data();
  assert.equal(b.gross,64.1);assert.equal(b.count,2);assert.equal(b.tare,2);
  await assertFails(addReading(viewer,'viewer',3));
  await assertFails(addReading(editor,'editor',3,4));
  await assertSucceeds(runTransaction(editor,async tx=>{
   const ref=doc(editor,batchPath),snap=await tx.get(ref);
   if(snap.data().status!=='pending')throw Error('not pending');
   tx.update(ref,{tare:4.1,updatedAt:serverTimestamp()});
  }));
  b=(await read(admin)).data();assert.equal(b.tare,4.1);
  await assertFails(runTransaction(editor,async tx=>{
   const ref=doc(editor,batchPath);await tx.get(ref);
   tx.update(ref,{status:'approved',net:60,reviewedBy:'editor',reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }));
  await assertSucceeds(runTransaction(admin,async tx=>{
   const ref=doc(admin,batchPath),snap=await tx.get(ref),x=snap.data();
   tx.update(ref,{status:'approved',net:Math.round((x.gross-x.tare)*1000)/1000,
    reviewedBy:'admin',reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }));
  await assertFails(addReading(editor,'editor',12));
  b=(await read(admin)).data();assert.equal(b.net,60);assert.equal(b.status,'approved');
  console.log('PASS EHS QR weighing: two readings, tare, admin approval, lock and role denial');
 }finally{await env.cleanup()}
})().catch(e=>{console.error(e);process.exitCode=1});
