import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,where,runTransaction,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {resolveMember} from '../member-admin.js';
import {loadEhsPermissions,may} from '../ehs-permissions.js?v=20261119weigh1';

const $=id=>document.getElementById(id);
const DEFAULT=[{code:'ctnh-metal-packaging',name:'Bao bì kim loại thải',group:'CTNH'}];
const params=new URLSearchParams(location.search);
const fmt=n=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
const today=()=>{const dt=new Date();return new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,10)};
let auth,db,user=null,role=null,category='',catalog=DEFAULT,batches=[],entries=[],batch=null,revision=0;
const kiosk=params.has('type');
const recentWeights=[];
function renderKioskHistory(){
 const target=$('kioskHistoryRows');if(!target)return;
 target.innerHTML=recentWeights.length?recentWeights.map(x=>'<tr><td>'+escape(x.time)+'</td><td>'+escape(x.name)+'</td><td>'+fmt(x.value)+'</td></tr>').join(''):'<tr><td colspan="3">Chưa có lượt cân trên thiết bị này</td></tr>';
}
document.body.classList.toggle('qr-entry',kiosk);
let syncing=false,nextRetryAt=0,submitting=false,retryHandle=null;
const storageKey=()=>user?'ehs-weigh-pending-v1:'+user.uid:null;
const readQueue=()=>{try{const rows=JSON.parse(localStorage.getItem(storageKey())||'[]');return Array.isArray(rows)?rows:[]}catch{return []}};
function writeQueue(items){localStorage.setItem(storageKey(),JSON.stringify(items))}
function showQueue(){const n=readQueue().length;$('pendingSync').textContent=n?`${n} lượt đã lưu tạm trên máy, CHƯA đồng bộ Firebase. Không xóa dữ liệu trình duyệt.`:''}

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
 renderCatalogRows(catalog);
 showQr();
}
function qrUrl(){const url=new URL(location.href);url.search='';url.searchParams.set('type',category);return url.toString()}
function showQr(){
 $('selectedType').textContent=byCategory()?.name||'';
 $('kioskType').textContent=byCategory()?.name||'Chọn loại rác';
 $('qrCode').replaceChildren();
 if(window.QRCode&&category)new window.QRCode($('qrCode'),{text:qrUrl(),width:170,height:170});
 else $('qrCode').textContent=qrUrl();
}
function isStaff(){return !!user&&!!role&&may('waste_weigh')}
function refreshVisibility(){
 $('staff').hidden=!isStaff();$('session').hidden=!isStaff();$('admin').hidden=role!=='admin';$('weighSummary').hidden=!isStaff()||kiosk;
 $('login').hidden=!!user;$('logout').hidden=!user;
 $('account').textContent=user?(user.email+' · '+(role||'chưa cấp quyền')):'Chưa đăng nhập EHS';
 document.body.classList.toggle('kiosk-ready',kiosk&&isStaff());
 $('addWeight').textContent=kiosk?'OK':' + Lưu lần cân, tiếp tục nhập';
}
async function loadCatalog(){
 try{
  const snap=await getDoc(doc(db,'settings','waste_weigh_catalog'));
  if(snap.exists()&&Array.isArray(snap.data().categories)){
   const valid=snap.data().categories.filter(c=>/^[a-z0-9-]{2,60}$/.test(c.code)&&typeof c.name==='string'&&c.name.trim());
   if(valid.length)catalog=valid;
  }
  try{localStorage.setItem('ehs-weigh-catalog:'+user.uid,JSON.stringify(catalog))}catch{}
 }catch(e){
  if(!quotaError(e))throw e;
  // Catalog is not authorization. Role/permission checks already succeeded.
  try{
   const cached=JSON.parse(localStorage.getItem('ehs-weigh-catalog:'+user.uid)||'[]');
   if(Array.isArray(cached)&&cached.length)catalog=cached;
  }catch{}
  feedback('Firebase vượt quota đọc dữ liệu. Dùng danh mục đã lưu trên thiết bị, lượt cân sẽ CHƯA đồng bộ.',true);
 }
 setOptions();
}
async function loadCurrent(){
 if(!isStaff())return;
 if(!dateOK($('day').value)||!category)return toast('Ngày hoặc loại rác không hợp lệ',true);
 const id=batchId();
 const snap=await getDoc(doc(db,'waste_weigh_batches',id));
 batch=snap.exists()?{id,...snap.data()}:null;
 if(!kiosk){
  const rows=await getDocs(query(collection(db,'waste_weigh_entries'),where('batchId','==',id)));
  entries=rows.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
 }else entries=[];
 renderTotals();
}
function renderTotals(){
 const gross=Number(batch?.gross||0);
 $('count').textContent=String(batch?.count||0);
 $('gross').textContent=fmt(gross)+' kg';
 $('tare').value=String(batch?.tare??0);
 $('net').textContent=fmt(Math.max(0,round(gross-Number(batch?.tare||0))))+' kg';
 $('state').textContent=({pending:'Chờ phê duyệt',approved:'Đã duyệt',rejected:'Đã từ chối'})[batch?.status]||'Chưa nhập';
 const editing=(!batch||batch.status==='pending');
 $('weightInput').disabled=!editing;
 $('addWeight').disabled=!editing;
 $('tare').disabled=!editing;$('saveTare').disabled=!editing;
 if(!kiosk)$('entries').innerHTML=entries.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+escape(x.createdAt?.toDate?.()?.toLocaleString('vi-VN')||'Đang đồng bộ')+'</td><td>'+fmt(x.value)+'</td></tr>').join('')||'<tr><td colspan="3">Chưa có lượt cân</td></tr>';
 showQueue();
}
const quotaError=e=>e?.code==='resource-exhausted'||/quota.exceeded|resource.exhausted/i.test(String(e?.message||''));
async function flushQueue(force=false){
 if(syncing||!user||!isStaff()||(!force&&Date.now()<nextRetryAt))return;
 syncing=true;
 try{
  let queue=readQueue();
  while(queue.length){
   const x=queue[0],entryRef=doc(db,'waste_weigh_entries',x.id);
   const batchRef=doc(db,'waste_weigh_batches',x.batchId);
   const result=await runTransaction(db,async tx=>{
    const entry=await tx.get(entryRef);
    const existing=await tx.get(batchRef);
    if(entry.exists())return {batch:existing.exists()?existing.data():null};
    if(existing.exists()&&existing.data().status!=='pending')throw Error('Lô cân đã được phê duyệt; dữ liệu lưu tạm cần Admin kiểm tra.');
    const old=existing.exists()?existing.data():null;
    const next=round(Number(old?.gross||0)+x.value);
    const count=Number(old?.count||0)+1;
    if(existing.exists())tx.update(batchRef,{gross:next,count,lastEntryId:entryRef.id,updatedAt:serverTimestamp()});
    else tx.set(batchRef,{date:x.date,code:x.code,name:x.name,group:x.group,gross:next,count:1,tare:0,lastEntryId:entryRef.id,status:'pending',createdBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(entryRef,{batchId:x.batchId,date:x.date,code:x.code,value:x.value,createdBy:user.uid,createdAt:serverTimestamp()});
    return {batch:{...(old||{}),gross:next,count,tare:old?.tare||0,status:'pending'}};
   });
   if(x.batchId===batchId()&&result.batch){batch={id:x.batchId,...result.batch};renderTotals()}
   // Preserve entries appended while the asynchronous Firebase transaction was running.
   writeQueue(readQueue().filter(p=>p.id!==x.id));
   queue=readQueue();
  }
  nextRetryAt=0;
  toast('Đã đồng bộ tất cả lượt cân lên Firebase.');
 }catch(e){
  if(quotaError(e)){
   nextRetryAt=Date.now()+60000;
   if(retryHandle)clearTimeout(retryHandle);
   retryHandle=setTimeout(()=>{retryHandle=null;void flushQueue(true)},60000);
   toast('Firebase đã vượt hạn mức (quota exceeded). Lượt cân được GIỮ TẠM trên máy, chưa lên hệ thống. Thử đồng bộ lại sau khi quota được cấp lại hoặc nâng hạn mức.',true);
  }else toast('Chưa đồng bộ: '+e.message+' — dữ liệu tạm vẫn nằm trên máy.',true);
 }finally{syncing=false;showQueue()}
}
async function addWeight(){
 if(submitting)return;
 if(!isStaff())return toast('Chưa có quyền nhập cân',true);
 if(kiosk&&$('day').value!==today()){
function summaryRange(){
 const raw=$('summaryDate').value;
 const month=$('summaryPeriod').value==='month';
 const start=month?raw+'-01':raw;
 if(!dateOK(start))throw Error('Vui lòng chọn ngày hợp lệ.');
 // Use an exclusive upper bound to avoid timezone ambiguity.
 const next=new Date(start+'T12:00:00');if(month)next.setMonth(next.getMonth()+1);else next.setDate(next.getDate()+1);
 const exclusive=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0');
 return {start,exclusive};
}
async function loadSummary(){
 if(!isStaff()||kiosk)return;
 const status=$('summaryStatus'),button=$('summaryLoad');button.disabled=true;
 status.textContent='Đang tải các lô cân theo kỳ...';
 try{
  const {start,exclusive}=summaryRange();
  const result=await getDocs(query(collection(db,'waste_weigh_batches'),where('date','>=',start),where('date','<',exclusive)));
  const term=$('summarySearch').value.trim().toLocaleLowerCase('vi');
  const groups=new Map();
  for(const snap of result.docs){
   const x=snap.data(),name=String(x.name||''),group=String(x.group||''),code=String(x.code||'');
   if(term&&!(name+' '+group+' '+code).toLocaleLowerCase('vi').includes(term))continue;
   const key=group+'|'+code;
   const row=groups.get(key)||{group,name,count:0,gross:0,tare:0};
   row.count+=Number(x.count)||0;row.gross+=Number(x.gross)||0;row.tare+=Number(x.tare)||0;
   groups.set(key,row);
  }
  const rows=[...groups.values()].sort((a,b)=>a.group.localeCompare(b.group,'vi')||a.name.localeCompare(b.name,'vi'));
  $('summaryRows').innerHTML=rows.map(x=>'<tr><td>'+escape(x.group)+'</td><td>'+escape(x.name)+'</td><td>'+fmt(x.count)+'</td><td>'+fmt(x.gross)+'</td><td>'+fmt(x.tare)+'</td><td>'+fmt(Math.max(0,round(x.gross-x.tare)))+'</td></tr>').join('')||'<tr><td colspan="6">Không có dữ liệu phù hợp.</td></tr>';
  const gross=rows.reduce((a,x)=>a+x.gross,0),tare=rows.reduce((a,x)=>a+x.tare,0);
  $('summaryTotal').textContent='Tổng cân: '+fmt(gross)+' kg · Trừ bao bì: '+fmt(tare)+' kg · Ròng: '+fmt(Math.max(0,round(gross-tare)))+' kg';
  status.textContent='Đã thống kê '+result.size+' lô trong kỳ; '+rows.length+' loại/nhóm phù hợp. Bao gồm lô chưa duyệt.';
 }catch(e){status.textContent='Không tải được thống kê: '+e.message;}
 finally{button.disabled=false}
}
$('summaryDate').value=today();
$('summaryPeriod').onchange=()=>{$('summaryDate').type=$('summaryPeriod').value==='month'?'month':'date';$('summaryDate').value=$('summaryPeriod').value==='month'?today().slice(0,7):today()};
$('summaryLoad').onclick=loadSummary;

$('day').value=today();await loadCurrent()}
 const raw=$('weightInput').value.trim(),value=Number(raw),item=byCategory(),date=$('day').value;
 if(!raw||!dateOK(date)||!item||!Number.isFinite(value)||value<=0||value>100000)return toast('Nhập khối lượng từ 0,001 đến 100.000 kg',true);
 if(batch?.status&&batch.status!=='pending')return toast('Lô cân đã khóa, cần chọn ngày hoặc loại khác.',true);
 submitting=true;$('addWeight').disabled=true;
 try{
  const current=readQueue();
  if(current.length>=300)throw Error('Bộ nhớ tạm đã có 300 lượt. Phải đồng bộ trước khi nhập thêm.');
  const entryRef=doc(collection(db,'waste_weigh_entries'));
  const record={id:entryRef.id,batchId:date+'_'+item.code,date,code:item.code,name:item.name,group:item.group,value:round(value)};
  writeQueue([...current,record]);
  recentWeights.unshift({time:new Date().toLocaleTimeString('vi-VN'),name:item.name,value:record.value});
  if(recentWeights.length>100)recentWeights.length=100;
  renderKioskHistory();
  $('weightInput').value='';
  toast('Đã ghi tạm '+fmt(value)+' kg. '+(Date.now()<nextRetryAt?'Firebase còn vượt quota, CHƯA đồng bộ.':'Đang đồng bộ…'),Date.now()<nextRetryAt);
  showQueue();$('weightInput').focus();
  void flushQueue();
 }catch(e){toast('Không ghi được lượt cân: '+e.message+'. Số đang nhập được giữ nguyên.',true)}
 finally{submitting=false;$('addWeight').disabled=batch?.status==='approved';$('weightInput').focus()}
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
const catalogStatus=(message,error=false)=>{
 const node=$('catalogMessage');node.textContent=message;node.classList.toggle('warn',error);
};
function addCatalogRow(item={name:'',group:'CTNH',code:''}){
 const tbody=$('catalogRows'),row=document.createElement('tr');
 const index=document.createElement('td');
 index.textContent=String(tbody.children.length+1);
 row.append(index);
 for(const field of ['name','group','code']){
  const cell=document.createElement('td'),input=document.createElement('input');
  input.dataset.catalogField=field;
  input.type='text';input.value=String(item[field]||'');
  input.maxLength=field==='code'?60:field==='group'?60:150;
  input.setAttribute('aria-label',{name:'Tên loại rác',group:'Nhóm rác',code:'Mã loại rác'}[field]+' dòng '+index.textContent);
  if(field==='name')input.placeholder='Nhập tên rác';
  if(field==='group')input.placeholder='CTNH';
  if(field==='code')input.placeholder='ma-loai-rac';
  if(field==='name')input.addEventListener('blur',()=>{
   const code=row.querySelector('[data-catalog-field="code"]');
   if(!code.value.trim())code.value=makeCode(input.value);
  });
  cell.append(input);row.append(cell);
 }
 const actionCell=document.createElement('td'),remove=document.createElement('button');
 remove.type='button';remove.className='remove-row';remove.textContent='×';
 remove.setAttribute('aria-label','Xóa dòng '+index.textContent);
 remove.onclick=()=>{
  if(tbody.children.length===1)return catalogStatus('Danh mục phải có ít nhất một dòng.',true);
  row.remove();
  [...tbody.children].forEach((tr,i)=>{
   tr.firstElementChild.textContent=String(i+1);
   tr.querySelectorAll('[data-catalog-field]').forEach(input=>input.setAttribute('aria-label',({name:'Tên loại rác',group:'Nhóm rác',code:'Mã loại rác'})[input.dataset.catalogField]+' dòng '+(i+1)));
   tr.querySelector('.remove-row').setAttribute('aria-label','Xóa dòng '+(i+1));
  });
  catalogStatus('Có thay đổi chưa lưu.');
 };
 actionCell.append(remove);row.append(actionCell);tbody.append(row);
 return row;
}
const makeCode=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
function renderCatalogRows(items){
 $('catalogRows').replaceChildren();
 items.forEach(item=>addCatalogRow(item));
 if(!items.length)addCatalogRow();
 catalogStatus('');
}
function readCatalogRows(){
 return [...$('catalogRows').children].map(row=>Object.fromEntries(
  [...row.querySelectorAll('[data-catalog-field]')].map(input=>[input.dataset.catalogField,input.value.trim()])
 )).filter(row=>row.name||row.group||row.code);
}
async function saveCatalog(){
 if(role!=='admin')return;
 const next=readCatalogRows();
 if(!next.length||next.length>100||next.some(x=>!x.name||x.name.length>150||!x.group||x.group.length>60||!/^[a-z0-9-]{2,60}$/.test(x.code))){
  return catalogStatus('Kiểm tra các cột: Tên rác và Nhóm không được trống; mã chỉ gồm a-z, 0-9, dấu -, tối đa 60 ký tự.',true);
 }
 if(new Set(next.map(x=>x.code)).size!==next.length)return catalogStatus('Mã loại rác đang bị trùng, hãy sửa trước khi lưu.',true);
 const before=new Map(catalog.map(c=>[c.code,c.name]));
 const missing=[...before.keys()].filter(code=>!next.some(row=>row.code===code));
 if(missing.length&&!confirm('Bạn đang xóa '+missing.length+' mã loại rác cũ. QR đã in với các mã đó có thể không dùng được. Tiếp tục?'))return;
 const button=$('saveCatalog');button.disabled=true;
 try{
  await setDoc(doc(db,'settings','waste_weigh_catalog'),{categories:next,updatedBy:user.uid,updatedAt:serverTimestamp()});
  catalog=next;setOptions();await loadCurrent();
  catalogStatus('Đã lưu '+next.length+' loại rác lên Firebase.');
 }catch(e){catalogStatus('Không lưu được danh mục: '+e.message,true)}
 finally{button.disabled=false}
}

$('day').value=today();
$('category').onchange=async()=>{category=$('category').value;showQr();await loadCurrent()};
$('changeType').onclick=()=>{$('dialogCategory').value=category;$('typeDialog').showModal()};
$('kioskChangeType').onclick=()=>$('changeType').click();
$('cancelType').onclick=()=>$('typeDialog').close();
$('applyType').onclick=async()=>{category=$('dialogCategory').value;$('category').value=category;params.set('type',category);history.replaceState(null,'','?'+params.toString());$('typeDialog').close();showQr();await loadCurrent()};
$('day').onchange=loadCurrent;$('refresh').onclick=async()=>{await flushQueue(true);await loadCurrent();if(!kiosk)await loadPending()};
window.addEventListener('online',()=>flushQueue(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)flushQueue(true)});
$('copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText(qrUrl());toast('Đã sao chép liên kết QR.')}catch{toast(qrUrl())}};
$('addWeight').onclick=addWeight;$('weightInput').onkeydown=e=>{if(e.key==='Enter')addWeight()};
$('saveTare').onclick=saveTare;$('saveCatalog').onclick=saveCatalog;
$('catalogAdd').onclick=()=>{const row=addCatalogRow();row.querySelector('[data-catalog-field="name"]').focus();catalogStatus('Có dòng mới chưa lưu.')};
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
   await loadCurrent();if(!kiosk)await loadPending();
   showQueue();if(readQueue().length)await flushQueue(true);
   if(kiosk)$('weightInput').focus();
   feedback('Đã xác minh tài khoản EHS. Lượt cân được lưu ngay vào Firestore.');
  }catch(e){feedback('Lỗi xác minh hoặc tải dữ liệu: '+e.message,true)}
 });
}
