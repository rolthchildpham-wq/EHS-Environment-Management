'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,deleteDoc,writeBatch,serverTimestamp,getDocs,collection,runTransaction}=require('firebase/firestore');
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
  await env.withSecurityRulesDisabled(async ctx=>{
   const d=ctx.firestore();
   await setDoc(doc(d,'records/quantity-edit'),{date:'2026-11-20',kind:'waste',value:10,
    unit:'kg',name:'Test',note:'',source:'excel',createdBy:'editor',createdAt:new Date()});
   await setDoc(doc(d,'waste_weigh_batches/2026-11-20_test'),{
    date:'2026-11-20',code:'test',name:'Test',group:'CTNH',gross:10,count:1,
    tare:0,status:'approved',net:10,createdBy:'editor',createdAt:new Date()
   });
  });
  await assertFails(runTransaction(editor,async tx=>{
   const ref=doc(editor,'records/quantity-edit');await tx.get(ref);
   tx.update(ref,{value:11,updatedBy:'editor',updatedAt:serverTimestamp(),lastAuditId:'fake'});
  }));
  const editRef=doc(db,'records/quantity-edit'),editLog=doc(db,'business_audit/test_record_edit');
  await assertSucceeds(runTransaction(db,async tx=>{
   const snap=await tx.get(editRef);
   tx.update(editRef,{value:11,updatedBy:'admin',updatedAt:serverTimestamp(),lastAuditId:editLog.id});
   tx.set(editLog,{target:'records/quantity-edit',action:'edit',actorUid:'admin',
    actorEmail:'admin@example.com',occurredAt:serverTimestamp(),field:'value',
    before:snap.data().value,after:11});
  }));
  await assertFails(runTransaction(db,async tx=>{
   const ref=doc(db,'records/quantity-edit');await tx.get(ref);
   tx.update(ref,{value:12,updatedBy:'admin',updatedAt:serverTimestamp(),lastAuditId:'no_audit'});
  }));
  const weighRef=doc(db,'waste_weigh_batches/2026-11-20_test'),voidLog=doc(db,'business_audit/void_test');
  await assertSucceeds(runTransaction(db,async tx=>{
   const snap=await tx.get(weighRef);
   assert.equal(snap.data().status,'approved');
   tx.update(weighRef,{status:'void',updatedBy:'admin',updatedAt:serverTimestamp(),lastAuditId:voidLog.id});
   tx.set(voidLog,{target:'waste_weigh_batches/2026-11-20_test',action:'void',
    actorUid:'admin',actorEmail:'admin@example.com',occurredAt:serverTimestamp(),
    field:'status',before:'approved',after:'void'});
  }));
  await assertFails(runTransaction(db,async tx=>{
   const ref=doc(db,'waste_weigh_batches/2026-11-20_test');await tx.get(ref);
   tx.update(ref,{status:'approved',updatedBy:'admin',updatedAt:serverTimestamp(),lastAuditId:'reapprove'});
  }));
  console.log('PASS audit rules: admin-only access, atomic change, delete backup and QR void');
 }finally{await env.cleanup()}
})().catch(e=>{console.error(e);process.exitCode=1});
