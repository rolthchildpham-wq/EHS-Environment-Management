/* TOPKEY EHS session bridge for WWTP (simulation-only).
 * Uses the SAME Firebase project, signed-in Google user, member registry
 * and configurable EHS permission matrix. No PLC transport here.
 */
import '../firebase-config.js';
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {resolveMember} from '../member-admin.js';
import {loadEhsPermissions,may} from '../ehs-permissions.js';

let role=null, loginEmail='', ready=false;
const css=document.createElement('style');
css.textContent=`
#ehsWwtpGate{position:fixed;inset:0;background:#080c14;color:#d5e7f1;z-index:2147483646;display:flex;justify-content:center;align-items:center;padding:24px;font:500 15px/1.6 system-ui,Arial,sans-serif}
#ehsWwtpGate .gate-card{width:min(520px,100%);padding:30px;border:1px solid #28445c;border-radius:16px;background:#0d192c;text-align:center}
#ehsWwtpGate a{display:inline-block;margin-top:16px;padding:11px 18px;background:#0c859b;color:white;text-decoration:none;border-radius:9px}
body.ehsWwtpUnauthorized{overflow:hidden!important}
#ehsWWTPIdentity{position:fixed;bottom:10px;right:12px;z-index:50;padding:6px 10px;border-radius:8px;background:#071a2de8;border:1px solid #25677c;color:#d4f1f5;font:11px system-ui}
`;
document.head.append(css);
const gate=document.createElement('div');gate.id='ehsWwtpGate';gate.setAttribute('role','status');
gate.innerHTML='<div class="gate-card"><strong>TOPKEY • EHS</strong><p id="ehsGateMsg">Đang xác minh phiên đăng nhập EHS…</p><a href="../">Về Hub EHS / Đăng nhập</a></div>';
document.body.append(gate);
document.body.classList.add('ehsWwtpUnauthorized');
function showGate(msg){gate.style.display='flex';document.body.classList.add('ehsWwtpUnauthorized');gate.querySelector('#ehsGateMsg').textContent=msg}
function hideGate(){gate.style.display='none';document.body.classList.remove('ehsWwtpUnauthorized')}
function deny(){if(typeof window.showToast==='function')window.showToast('Chức năng này chưa được cấp quyền trong EHS.','error');}
const simFns=['toggleSimulationMode','toggleExceedanceSimulation','commandEquipment','setEquipmentMode','setSimLevel','toggleChemPump','openMixModal','applyNewBatch','setPlantPhase','setShiftHours','setShiftTankLevel','saveEntryNumber','saveEntryText','saveChemHours','saveShiftLog','importShiftLogFile'];
const adminFns=['setPidEditorRole','togglePidLayoutEdit','savePidLayout','startPidLayoutEditing','resetPidLayout','importPidLayoutFile','setTankCalibration','setPumpCalibration','savePlantCalibration','setMonitorConfig'];
function protect(list,action){
 for(const name of list){
   const original=window[name];
   if(typeof original!=='function'||original.__ehsGuarded)continue;
   const guarded=function(...args){if(!ready||!may(action)){deny();return false}return original.apply(this,args)};
   guarded.__ehsGuarded=true;window[name]=guarded;
 }
}
function protectAll(){protect(simFns,'wwtp_simulate');protect(adminFns,'wwtp_design')}
function markAccess(){
 const admin=ready&&may('wwtp_design');
 const sim=ready&&may('wwtp_simulate');
 const rolePicker=document.getElementById('adminDemoRole');
 if(rolePicker&&!admin){rolePicker.value='viewer';rolePicker.disabled=true}
 const adminStart=document.getElementById('adminStartEdit');
 if(adminStart&&!admin)adminStart.disabled=true;
 if(!sim&&document.getElementById('simModeBtn'))document.getElementById('simModeBtn').disabled=true;
 let id=document.getElementById('ehsWWTPIdentity');
 if(!id){id=document.createElement('div');id.id='ehsWWTPIdentity';document.body.append(id)}
 id.textContent=ready?('EHS '+loginEmail+' · '+String(role).toUpperCase()+' · PLC OFF'):'EHS · OFF';
}
protectAll();
window.__ehsWwtpAuth={get role(){return role},get ready(){return ready}};
const config=window.EHS_FIREBASE_CONFIG;
if(!config){showGate('Không có cấu hình Firebase EHS; không cho phép mở module.')}
else{
 const app=getApps().length?getApp():initializeApp(config),auth=getAuth(app),db=getFirestore(app);
 onAuthStateChanged(auth,async user=>{
   ready=false;role=null;loginEmail='';showGate('Đang kiểm tra quyền thành viên EHS…');
   if(!user){showGate('Chưa đăng nhập Google trên EHS.');markAccess();return}
   try{
     const member=await resolveMember(db,user);
     if(!member?.role){showGate('Tài khoản chưa được cấp quyền hoặc đã bị khóa trong EHS.');markAccess();return}
     role=member.role;loginEmail=user.email||'';
     await loadEhsPermissions(db,user,role);
     if(!may('wwtp_view')){showGate('Tài khoản EHS không được cấp quyền xem hệ thống XLNT.');markAccess();return}
     ready=true;protectAll();markAccess();hideGate();
   }catch(e){showGate('Không xác minh được phiên EHS hoặc quyền truy cập. '+e.message);markAccess()}
 });
}
