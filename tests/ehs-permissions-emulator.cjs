'use strict';
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,serverTimestamp}=require('firebase/firestore');
const root=process.cwd();
const settings='settings/ehs_permissions';
const defaultRights={dashboard:true,journal:true,qr_in:true,qr_out:false,excel_import:false,manual_entry:false,reports:true,ghg_write:false};
const docPayload=(by,kind,source)=>({
 date:'2026-11-16',kind,quantity:2,unit:'kg',name:'Vật tư kiểm thử',code:'TEST-QR',
 note:'Bộ kiểm tra phân quyền',sourceFile:source,sourceSheet:'QR',importId:'gate_20261116',
 createdBy:by,createdAt:serverTimestamp()
});
(async()=>{
 const env=await initializeTestEnvironment({
  projectId:'demo-ehs-permission-gate',
  firestore:{host:'127.0.0.1',port:8084,rules:fs.readFileSync('firestore.rules','utf8')}
 });
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await Promise.all([
    setDoc(doc(db,'members/admin'),{active:true,role:'admin'}),
    setDoc(doc(db,'members/editor'),{active:true,role:'editor'}),
    setDoc(doc(db,'members/viewer'),{active:true,role:'viewer'}),
    setDoc(doc(db,'members/disabled'),{active:false,role:'editor'}),
    setDoc(doc(db,settings),{editor:defaultRights,viewer:{dashboard:true,journal:false,reports:true}})
   ]);
  });
  const admin=env.authenticatedContext('admin').firestore();
  const editor=env.authenticatedContext('editor').firestore();
  const viewer=env.authenticatedContext('viewer').firestore();
  const disabled=env.authenticatedContext('disabled').firestore();
  const anon=env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(editor,'operations/allowed-in'),docPayload('editor','stock_in','QR scan')));
  await assertFails(setDoc(doc(editor,'operations/blocked-out'),docPayload('editor','stock_out','QR scan')));
  await assertFails(setDoc(doc(editor,'operations/blocked-excel'),docPayload('editor','stock_in','sheet.xlsx')));
  await assertSucceeds(setDoc(doc(admin,'operations/admin-out'),docPayload('admin','stock_out','QR scan')));
  await assertFails(setDoc(doc(viewer,'operations/viewer-write'),docPayload('viewer','stock_in','QR scan')));
  await assertFails(setDoc(doc(disabled,'operations/disabled-write'),docPayload('disabled','stock_in','QR scan')));
  await assertFails(setDoc(doc(anon,'operations/anon-write'),docPayload('anonymous','stock_in','QR scan')));
  await assertFails(setDoc(doc(editor,settings),{editor:{qr_in:false}}));
  await assertFails(setDoc(doc(viewer,settings),{editor:{qr_in:false}}));
  console.log('PASS EHS emulator: 9 authenticated, disabled and anonymous write guards');
 }finally{await env.cleanup()}
})().catch(e=>{console.error(e);process.exitCode=1});
