'use strict';
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,deleteDoc,writeBatch,serverTimestamp,getDocs,collection}=require('firebase/firestore');
(async()=>{
 const env=await initializeTestEnvironment({
  projectId:'demo-ehs-permission-gate',
  firestore:{host:'127.0.0.1',port:8084,rules:fs.readFileSync('firestore.rules','utf8')}
 });
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const d=ctx.firestore();
   await setDoc(doc(d,'members/admin'),{role:'admin',active:true});
   await setDoc(doc(d,'members/editor'),{role:'editor',active:true});
   await setDoc(doc(d,'records/r1'),{kind:'waste',value:3,createdBy:'editor'});
   await setDoc(doc(d,'reviews/v1'),{status:'pending',value:7});
  });
  const db=env.authenticatedContext('admin').firestore();
  const editor=env.authenticatedContext('editor').firestore();
  await assertFails(getDocs(collection(editor,'business_audit')));
  await assertFails(deleteDoc(doc(editor,'records/r1')));
  await assertFails(deleteDoc(doc(db,'records/r1')));
  await assertFails(setDoc(doc(editor,'business_audit/records_r1'),{target:'records/r1'}));
  const batch=writeBatch(db);
  batch.set(doc(db,'business_audit/records_r1'),{
   target:'records/r1',action:'delete',actorUid:'admin',actorEmail:'admin@example.com',
   occurredAt:serverTimestamp(),field:'document',
   before:{kind:'waste',value:3,createdBy:'editor'},after:null
  });
  batch.delete(doc(db,'records/r1'));
  await assertSucceeds(batch.commit());
  await assertFails(deleteDoc(doc(db,'reviews/v1')));
  const review=writeBatch(db),aid='review_audit_v1';
  review.update(doc(db,'reviews/v1'),{
   status:'approved',reviewedBy:'admin',reviewedAt:serverTimestamp(),lastAuditId:aid
  });
  review.set(doc(db,'business_audit/'+aid),{
   target:'reviews/v1',action:'review_status',actorUid:'admin',actorEmail:'admin@example.com',
   occurredAt:serverTimestamp(),field:'status',before:'pending',after:'approved'
  });
  await assertSucceeds(review.commit());
  console.log('PASS audit rules: admin-only read, deletion backup, atomic review transition');
 }finally{await env.cleanup()}
})().catch(e=>{console.error(e);process.exitCode=1});
