import {collection,doc,documentId,getDocs,query,orderBy,limit,startAfter,writeBatch,serverTimestamp,setDoc}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

// Intentionally excludes members, invites, settings and both audit collections.
const BUSINESS_COLLECTIONS=['operations','records','reviews'];
const node=id=>document.getElementById(id);
let db=null,owner=null,callback=null,busy=false;
const notify=message=>{if(node('resetStatus'))node('resetStatus').textContent=message;};
async function enumerate(collectionName){
 const docs=[];let last=null;
 while(true){
  const opts=[orderBy(documentId()),limit(300)];
  if(last)opts.push(startAfter(last));
  const page=await getDocs(query(collection(db,collectionName),...opts));
  docs.push(...page.docs);
  if(page.size<300)break;
  last=page.docs.at(-1);
 }
 return docs;
}
function downloadBackup(entries){
 const safeDocs=entries.map(({collectionName,snapshot})=>({
  collection:collectionName,id:snapshot.id,data:snapshot.data()
 }));
 const exportBlob=new Blob([JSON.stringify({
  project:'ehs-environment-management',exportedAt:new Date().toISOString(),
  warning:'EHS business data backup. Keep secure; do not publish.',documents:safeDocs
 },null,2)],{type:'application/json'});
 const url=URL.createObjectURL(exportBlob),a=document.createElement('a');
 a.href=url;a.download='EHS_SAO_LUU_TRUOC_XOA_'+new Date().toISOString().slice(0,10)+'.json';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function resetData(){
 if(busy||!owner||!db)return;
 const checked=node('resetAck');
 if(!checked?.checked)return notify('Vui lòng xác nhận đã hiểu việc xóa dữ liệu.');
 if(node('resetPhrase')?.value.trim()!=='XOA DU LIEU EHS')
  return notify('Bạn phải nhập chính xác XOA DU LIEU EHS để cho phép xóa.');
 if(!confirm('Bạn sắp XÓA VĨNH VIỄN số liệu EHS thuộc operations, records và reviews. Tài khoản nhân viên sẽ được giữ nguyên. Bạn đồng ý sao lưu trước và xóa toàn bộ?'))return;
 busy=true;node('resetButton').disabled=true;
 let entries=[],removed=0,auditRef=null;
 try{
  notify('Đang đọc toàn bộ số liệu để tạo bản sao lưu...');
  for(const collectionName of BUSINESS_COLLECTIONS){
   const docs=await enumerate(collectionName);
   entries.push(...docs.map(snapshot=>({collectionName,snapshot})));
  }
  downloadBackup(entries);
  const summary=Object.fromEntries(BUSINESS_COLLECTIONS.map(name=>[name,entries.filter(e=>e.collectionName===name).length]));
  if(!confirm('Đã tạo tệp sao lưu '+entries.length+' bản ghi. Hãy kiểm tra trình duyệt đã tải tệp JSON. Xóa '+JSON.stringify(summary)+'?'))return;
  auditRef=doc(collection(db,'data_reset_audit'));
  await setDoc(auditRef,{
   action:'reset_start',actorUid:owner.uid,actorEmail:owner.email||'',
   startedAt:serverTimestamp(),recordCounts:summary,total:entries.length,
   status:'started'
  });
  for(let i=0;i<entries.length;i+=200){
   const chunk=entries.slice(i,i+200),batch=writeBatch(db);
   for(const e of chunk)batch.delete(e.snapshot.ref);
   await batch.commit();removed+=chunk.length;
   notify('Đã xóa '+removed+'/'+entries.length+' bản ghi. Không tắt trang.');
  }
  await setDoc(doc(collection(db,'data_reset_audit')),{action:'reset_complete',
   actorUid:owner.uid,actorEmail:owner.email||'',completedAt:serverTimestamp(),
   deleted:removed,startedAuditId:auditRef.id,status:'completed'});
  node('resetPhrase').value='';checked.checked=false;
  notify('Đã làm sạch '+removed+' bản ghi. Thành viên và nhật ký quản trị được giữ nguyên. Có thể nhập lại Excel 2025/2026.');
  await callback?.();
 }catch(err){
  notify('Xóa chưa hoàn tất ('+removed+'/'+entries.length+'). Lỗi: '+err.message+
   '. Tệp sao lưu đã được tải nếu bạn đã xác nhận. Có thể mở lại trang và tiếp tục sau khi kiểm tra.');
 }finally{busy=false;node('resetButton').disabled=false;}
}
export function mountDataReset(database,user,role,refresh){
 const root=node('resetDataMount');if(!root)return;
 db=database;owner=role==='admin'?user:null;callback=refresh;
 if(!owner){root.innerHTML='';return}
 root.innerHTML='<div class="panel" style="margin-top:18px;border:2px solid #b64b3d">'+
  '<h2>Khôi phục dữ liệu gốc / Làm sạch dữ liệu</h2>'+
  '<p class="muted">Chỉ Admin. Xóa toàn bộ số liệu nghiệp vụ đã nhập sai ở <code>operations</code>, <code>records</code>, <code>reviews</code> để nhập lại Excel. KHÔNG xóa tài khoản, lời mời, quyền nhân viên, cấu hình hay nhật ký audit.</p>'+
  '<p class="notice"><b>Không thể hoàn tác bằng một nút.</b> Website sẽ tải bản sao lưu JSON trước khi xóa, hiển thị xác nhận lần hai và ghi lịch sử thao tác. Chỉ dùng sau khi đã xác minh tệp sao lưu.</p>'+
  '<label><input type="checkbox" id="resetAck"> Tôi đã hiểu dữ liệu nghiệp vụ sẽ bị xóa vĩnh viễn và sẽ kiểm tra bản sao lưu.</label>'+
  '<label style="margin-top:12px">Nhập XOA DU LIEU EHS để xác nhận<input id="resetPhrase" autocomplete="off" placeholder="XOA DU LIEU EHS"></label>'+
  '<button type="button" class="danger" id="resetButton" style="margin-top:12px">Sao lưu và xóa sạch dữ liệu EHS</button>'+
  '<p class="notice" id="resetStatus" role="status" aria-live="polite">Chưa thực hiện thao tác xóa.</p></div>';
 node('resetButton').onclick=resetData;
}
