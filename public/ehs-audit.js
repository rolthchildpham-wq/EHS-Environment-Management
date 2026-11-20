import {collection,doc,getDocs,query,limit,orderBy,runTransaction,serverTimestamp}
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
