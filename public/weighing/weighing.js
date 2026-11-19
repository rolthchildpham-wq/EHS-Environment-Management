import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,where,runTransaction,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {resolveMember} from '../member-admin.js';
import {loadEhsPermissions,may} from '../ehs-permissions.js';

const $=id=>document.getElementById(id);
const DEFAULT=[{code:'ctnh-metal-packaging',name:'Bao bì kim loại thải',group:'CTNH'}];
const params=new URLSearchParams(location.search);
const fmt=n=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
const today=()=>{const dt=new Date();return new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,10)};
let auth,db,user=null,role=null,category='',catalog=DEFAULT,batches=[],entries=[],batch=null,revision=0;
const feedback=(msg,error=false)=>{ $('status').textContent=msg;$('status').classList.toggle('warn',error)};
const toast=(msg,error=false)=>{$('saveMessage').textContent=msg;$('saveMessage').classList.toggle('warn',error)};
const round=n=>Math.round(n*1000)/1000;
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T12:00:00').getTime());
const batchId=()=>$('day').value+'_'+category;
const byCategory=()=>catalog.find(c=>c.code===category);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setOptions(){
 const list=catalog.map(c=>'<option value="'+escape(c.code)+'">'+escape(c.name+' ('+c.group+')')+'</option>').join('');
 $('category').innerHTML=list;$('dialogCategory').innerHTML=list;
 const fromQr=params.get('type');
 category=catalog.some(c=>c.code===fromQr)?fromQr:(catalog.some(c=>c.code===category)?category:catalog[0]?.code||'');
 $('category').value=category;$('dialogCategory').value=category;
 $('catalog').value=catalog.map(c=>c.name+' | '+c.group+' | '+c.code).join('\n');
 showQr();
}
function qrUrl(){const url=new URL(location.href);url.search='';url.searchParams.set('type',category);return url.toString()}
function showQr(){
 $('selectedType').textContent=byCategory()?.name||'';
 $('qrCode').replaceChildren();
 if(window.QRCode&&category)new window.QRCode($('qrCode'),{text:qrUrl(),width:170,height:170});
 else $('qrCode').textContent=qrUrl();
}
function isStaff(){return !!user&&!!role&&may('waste_weigh')}
function refreshVisibility(){
 $('staff').hidden=!isStaff();$('session').hidden=!isStaff();$('admin').hidden=role!=='admin';
 $('login').hidden=!!user;$('logout').hidden=!user;
 $('account').textContent=user?(user.email+' · '+(role||'chưa cấp quyền')):'Chưa đăng nhập EHS';
}
async function loadCatalog(){
 const snap=await getDoc(doc(db,'settings','waste_weigh_catalog'));
 if(snap.exists()&&Array.isArray(snap.data().categories)){
  const valid=snap.data().categories.filter(c=>/^[a-z0-9-]{2,60}$/.test(c.code)&&typeof c.name==='string'&&c.name.trim());
  if(valid.length)catalog=valid;
 }
 setOptions();
}
async function loadCurrent(){
 if(!isStaff())return;
 if(!dateOK($('day').value)||!category)return toast('Ngày hoặc loại rác không hợp lệ',true);
 const id=batchId();
 const [b,rows]=await Promise.all([
  getDoc(doc(db,'waste_weigh_batches',id)),
  getDocs(query(collection(db,'waste_weigh_entries'),where('batchId','==',id)))
 ]);
 batch=b.exists()?{id,...b.data()}:null;
 entries=rows.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
 $('count').textContent=String(entries.length);
 const gross=round(entries.reduce((n,x)=>n+Number(x.value||0),0));
 $('gross').textContent=fmt(gross)+' kg';
 $('tare').value=String(batch?.tare??0);
 const net=round(gross-Number(batch?.tare||0));
 $('net').textContent=fmt(Math.max(0,net))+' kg';
 $('state').textContent=({pending:'Chờ phê duyệt',approved:'Đã duyệt',rejected:'Đã từ chối'})[batch?.status]||'Chưa nhập';
 const editing=(!batch||batch.status==='pending');
 $('weightInput').disabled=!editing;$('addWeight').disabled=!editing;
 $('tare').disabled=!editing;$('saveTare').disabled=!editing;
 $('entries').innerHTML=entries.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+escape(x.createdAt?.toDate?.()?.toLocaleString('vi-VN')||'Đang đồng bộ')+'</td><td>'+fmt(x.value)+'</td></tr>').join('')||'<tr><td colspan="3">Chưa có lượt cân</td></tr>';
}
async function addWeight(){
 if(!isStaff())return toast('Chưa có quyền nhập cân',true);
 const value=Number($('weightInput').value),id=batchId(),item=byCategory(),date=$('day').value;
 if(!dateOK(date)||!item||!Number.isFinite(value)||value<=0||value>100000)return toast('Nhập khối lượng từ 0,001 đến 100.000 kg',true);
 $('addWeight').disabled=true;
 try{
  const entryRef=doc(collection(db,'waste_weigh_entries'));
  const batchRef=doc(db,'waste_weigh_batches',id);
  await runTransaction(db,async tx=>{
   const existing=await tx.get(batchRef);
   if(existing.exists()&&existing.data().status!=='pending')throw Error('Lô cân đã khóa, không thể thêm số liệu');
   const old=existing.exists()?existing.data():null;
   const next=round(Number(old?.gross||0)+value);
   if(existing.exists())tx.update(batchRef,{gross:next,count:Number(old.count||0)+1,lastEntryId:entryRef.id,updatedAt:serverTimestamp()});
   else tx.set(batchRef,{date,code:item.code,name:item.name,group:item.group,gross:next,count:1,tare:0,lastEntryId:entryRef.id,status:'pending',createdBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   tx.set(entryRef,{batchId:id,date,code:item.code,value,createdBy:user.uid,createdAt:serverTimestamp()});
  });
  $('weightInput').value='';toast('Đã lưu lượt cân '+fmt(value)+' kg. Tiếp tục nhập.');
  await loadCurrent();$('weightInput').focus();
 }catch(e){toast('Không lưu được: '+e.message,true);$('addWeight').disabled=false}
}
async function saveTare(){
 const tare=Number($('tare').value),id=batchId();
 if(!batch||batch.status!=='pending'||!Number.isFinite(tare)||tare<0||tare>Number(batch.gross))return toast('Bao bì phải từ 0 đến tổng khối lượng cân',true);
 try{
  await runTransaction(db,async tx=>{
   const ref=doc(db,'waste_weigh_batches',id),snap=await tx.get(ref);
   if(!snap.exists()||snap.data().status!=='pending'||tare>snap.data().gross)throw Error('Lô cân đã thay đổi hoặc khóa');
   tx.update(ref,{tare,updatedAt:serverTimestamp()});
  });
  toast('Đã lưu bao bì '+fmt(tare)+' kg; chờ Admin phê duyệt.');
  await loadCurrent();
 }catch(e){toast('Không lưu được bao bì: '+e.message,true)}
}
async function loadPending(){
 if(role!=='admin')return;
 const q=await getDocs(query(collection(db,'waste_weigh_batches'),where('status','==','pending')));
 batches=q.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>b.date.localeCompare(a.date));
 $('pending').replaceChildren();
 for(const b of batches){
  const item=document.createElement('div');item.className='row';item.style.padding='10px 0';item.style.borderBottom='1px solid #dce8ec';
  const label=document.createElement('div');label.textContent=b.date+' · '+b.name+' · '+fmt(b.gross)+' kg · '+b.count+' lượt · Bao bì '+fmt(b.tare)+' kg';
  const button=document.createElement('button');button.textContent='Duyệt '+fmt(round(b.gross-b.tare))+' kg';
  button.onclick=async()=>{
   if(!confirm('Duyệt lô '+b.date+' / '+b.name+'? Sau khi duyệt, lô sẽ khóa nhập liệu.'))return;
   button.disabled=true;
   try{
    await runTransaction(db,async tx=>{
     const ref=doc(db,'waste_weigh_batches',b.id),snap=await tx.get(ref);
     if(!snap.exists()||snap.data().status!=='pending')throw Error('Lô đã được xử lý');
     const x=snap.data();
     if(!Number.isFinite(x.gross)||!Number.isFinite(x.tare)||x.tare<0||x.tare>x.gross||x.count<1)throw Error('Khối lượng không hợp lệ');
     tx.update(ref,{status:'approved',net:round(x.gross-x.tare),reviewedBy:user.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    });
    await loadPending();await loadCurrent();toast('Đã phê duyệt. Dữ liệu ròng được liên kết với Nhật ký EHS.');
   }catch(e){toast('Duyệt thất bại: '+e.message,true);button.disabled=false}
  };
  item.append(label,button);$('pending').append(item);
 }
 if(!batches.length)$('pending').textContent='Không có lô đang chờ duyệt.';
}
async function saveCatalog(){
 if(role!=='admin')return;
 const rows=$('catalog').value.split('\n').map(s=>s.trim()).filter(Boolean);
 const next=rows.map(s=>{const [name,group='CTNH',code]=s.split('|').map(x=>x.trim());return {name,group,code}});
 if(!next.length||next.length>100||next.some(x=>!x.name||x.name.length>150||!x.group||x.group.length>60||!/^[a-z0-9-]{2,60}$/.test(x.code))||new Set(next.map(x=>x.code)).size!==next.length)return toast('Mỗi dòng: Tên loại | Nhóm | mã-khong-dau; mã duy nhất, tối đa 100 loại',true);
 try{await setDoc(doc(db,'settings','waste_weigh_catalog'),{categories:next,updatedBy:user.uid,updatedAt:serverTimestamp()});catalog=next;setOptions();await loadCurrent();toast('Đã lưu danh mục loại rác.')}catch(e){toast(e.message,true)}
}
$('day').value=today();
$('category').onchange=async()=>{category=$('category').value;showQr();await loadCurrent()};
$('changeType').onclick=()=>{$('dialogCategory').value=category;$('typeDialog').showModal()};
$('cancelType').onclick=()=>$('typeDialog').close();
$('applyType').onclick=async()=>{category=$('dialogCategory').value;$('category').value=category;params.set('type',category);history.replaceState(null,'','?'+params.toString());$('typeDialog').close();showQr();await loadCurrent()};
$('day').onchange=loadCurrent;$('refresh').onclick=async()=>{await loadCurrent();await loadPending()};
$('copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText(qrUrl());toast('Đã sao chép liên kết QR.')}catch{toast(qrUrl())}};
$('addWeight').onclick=addWeight;$('weightInput').onkeydown=e=>{if(e.key==='Enter')addWeight()};
$('saveTare').onclick=saveTare;$('saveCatalog').onclick=saveCatalog;
$('login').onclick=async()=>{try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){feedback('Đăng nhập lỗi: '+e.message,true)}};
$('logout').onclick=()=>signOut(auth);
if(!window.EHS_FIREBASE_CONFIG){feedback('Thiếu cấu hình Firebase EHS.',true)}
else{
 const app=getApps().length?getApp():initializeApp(window.EHS_FIREBASE_CONFIG);
 auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async u=>{
  const now=++revision;user=u;role=null;refreshVisibility();
  if(!u)return feedback('Hãy đăng nhập Google bằng tài khoản EHS được cấp quyền.');
  try{
   feedback('Đang xác minh quyền EHS…');
   const member=await resolveMember(db,u);if(now!==revision)return;
   role=member?.role||null;await loadEhsPermissions(db,u,role);if(now!==revision)return;
   refreshVisibility();
   if(!isStaff())return feedback('Tài khoản không có quyền cân rác. Liên hệ Admin.',true);
   await loadCatalog();if(now!==revision)return;
   await loadCurrent();await loadPending();
   feedback('Đã xác minh tài khoản EHS. Lượt cân được lưu ngay vào Firestore.');
  }catch(e){feedback('Lỗi xác minh hoặc tải dữ liệu: '+e.message,true)}
 });
}
