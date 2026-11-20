import {collection,doc,getDocs,getDoc,query,limit,orderBy,runTransaction,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const state={db:null,user:null};
const node=id=>document.getElementById(id);
const time=x=>x?.toDate?.()?.toLocaleString('vi-VN')||'—';
const show=x=>x===undefined?'—':typeof x==='object'?JSON.stringify(x):String(x);

// Review change and its immutable before/after entry commit atomically.
export async function auditReviewStatus(db,user,id,status){
 if(!user||!['approved','rejected'].includes(status))throw Error('Thao tác không hợp lệ.');
 const ref=doc(db,'reviews',id);
 const auditRef=doc(collection(db,'business_audit'));
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||snap.data().status!=='pending')throw Error('Phiếu không còn chờ duyệt.');
  const changes={status,reviewedBy:user.uid,reviewedAt:serverTimestamp(),lastAuditId:auditRef.id};
  tx.update(ref,changes);
  tx.set(auditRef,{target:'reviews/'+id,action:'review_status',
   actorUid:user.uid,actorEmail:user.email||'',occurredAt:serverTimestamp(),
   field:'status',before:'pending',after:status});
 });
}
const EDIT_FIELDS={
 operations:['quantity','name','unit','note','date'],
 records:['value','name','unit','note','date'],
 reviews:['value','name','unit','note','date']
};
function backupJson(target,data){
 const payload=JSON.stringify({project:'ehs-environment-management',exportedAt:new Date().toISOString(),
  target,document:data,reason:'Admin deleted a business record'},null,2);
 const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='EHS_BACKUP_'+target.replace('/','_')+'_'+Date.now()+'.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function editJournalSource(db,user,target,field,value){
 const [collectionName,id]=target.split('/');
 if(!user||!EDIT_FIELDS[collectionName]?.includes(field)||!id)throw Error('Không thể sửa nguồn này.');
 const ref=doc(db,collectionName,id),auditRef=doc(collection(db,'business_audit'));
 const numeric=field==='quantity'||field==='value';
 const next=numeric?Number(value):String(value).trim();
 if((numeric&&(!String(value).trim()||!Number.isFinite(next)||next<0))||
    (field==='date'&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(next))||
    (!numeric&&field!=='note'&&!next)||String(next).length>1400)throw Error('Giá trị không hợp lệ.');
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error('Bản ghi đã bị xóa.');
  if(collectionName==='reviews'&&snap.data().status!=='approved')throw Error('Chỉ sửa phiếu đã duyệt.');
  const before=snap.data()[field];
  if(before===next)throw Error('Dữ liệu không thay đổi.');
  tx.update(ref,{[field]:next,updatedBy:user.uid,updatedAt:serverTimestamp(),lastAuditId:auditRef.id});
  tx.set(auditRef,{target,action:'edit',actorUid:user.uid,actorEmail:user.email||'',
   occurredAt:serverTimestamp(),field,before,after:next});
 });
}
export async function deleteJournalSource(db,user,target){
 const [collectionName,id]=target.split('/');
 if(!user||!['operations','records','reviews'].includes(collectionName)||!id)throw Error('Không thể xóa nguồn này.');
 const ref=doc(db,collectionName,id);
 const snapshot=await getDoc(ref);
 if(!snapshot.exists())throw Error('Bản ghi đã bị xóa.');
 backupJson(target,snapshot.data());
 if(!confirm('Đã yêu cầu tải JSON sao lưu '+target+'. Kiểm tra đã lưu tệp rồi xác nhận XÓA bản ghi khỏi số liệu?'))return false;
 const auditRef=doc(db,'business_audit',collectionName+'_'+id);
 await runTransaction(db,async tx=>{
  const current=await tx.get(ref),audit=await tx.get(auditRef);
  if(!current.exists())throw Error('Bản ghi đã bị xóa.');
  if(audit.exists())throw Error('Đã có bản lưu xóa cho ID này; không được ghi đè lịch sử.');
  tx.set(auditRef,{target,action:'delete',actorUid:user.uid,actorEmail:user.email||'',
   occurredAt:serverTimestamp(),field:'document',before:current.data(),after:null});
  tx.delete(ref);
 });
 return true;
}
export async function voidApprovedWeighing(db,user,id){
 if(!user||!id)throw Error('Không hợp lệ.');
 const ref=doc(db,'waste_weigh_batches',id),auditRef=doc(collection(db,'business_audit'));
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||snap.data().status!=='approved')throw Error('Lô không còn trạng thái đã duyệt.');
  tx.update(ref,{status:'void',updatedBy:user.uid,updatedAt:serverTimestamp(),lastAuditId:auditRef.id});
  tx.set(auditRef,{target:'waste_weigh_batches/'+id,action:'void',actorUid:user.uid,
   actorEmail:user.email||'',occurredAt:serverTimestamp(),field:'status',before:'approved',after:'void'});
 });
}
async function reload(){
 if(!state.user||!state.db)return;
 const status=node('businessAuditStatus'),rows=node('businessAuditRows');
 status.textContent='Đang tải 100 thay đổi mới nhất…';
 try{
  const snap=await getDocs(query(collection(state.db,'business_audit'),orderBy('occurredAt','desc'),limit(100)));
  rows.innerHTML=snap.docs.map(s=>{const x=s.data();return '<tr><td>'+esc(time(x.occurredAt))+'</td><td>'+esc(x.actorEmail||x.actorUid)+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.target)+'</td><td>'+esc(x.field)+'</td><td>'+esc(show(x.before))+'</td><td>'+esc(show(x.after))+'</td></tr>'}).join('')||'<tr><td colspan="7">Chưa có lịch sử nghiệp vụ thuộc phạm vi ghi log.</td></tr>';
  status.textContent='Đang xem '+snap.size+' thay đổi gần nhất. Nhật ký bắt đầu từ thời điểm chức năng được áp dụng.';
 }catch(e){status.textContent='Không tải được nhật ký: '+e.message}
}
export function mountBusinessAudit(db,user,role){
 const host=node('businessAuditMount')||document.createElement('div');
 if(!host.id){host.id='businessAuditMount';node('admin')?.appendChild(host)}
 if(!user||role!=='admin'){host.replaceChildren();state.user=null;return}
 state.db=db;state.user=user;
 host.innerHTML='<div class="panel" style="margin-top:18px"><h2>Nhật ký thay đổi nghiệp vụ · Admin</h2>'+
 '<p class="muted">Giá trị trước → sau; người thực hiện và thời điểm. Chỉ hiển thị các luồng đã tích hợp nhật ký bắt buộc. Không thay thế bản sao lưu JSON.</p>'+
 '<button type="button" id="businessAuditReload">Làm mới nhật ký</button>'+
 '<p class="notice" role="status" id="businessAuditStatus"></p>'+
 '<div class="scroll"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Bản ghi</th><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead><tbody id="businessAuditRows"></tbody></table></div></div>';
 node('businessAuditReload').onclick=reload;
 void reload();
}
