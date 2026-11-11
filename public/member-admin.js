import {collection,doc,getDoc,getDocs,setDoc,writeBatch,query,limit,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={admin:'Quản trị',editor:'Nhập liệu',viewer:'Chỉ xem'};
const state={db:null,user:null,members:[],invites:[],audit:[]};
const node=id=>document.getElementById(id);
const msg=s=>{if(node('membersFeedback'))node('membersFeedback').textContent=s;};
const fmtTime=x=>x?.toDate?.()?.toLocaleString('vi-VN')||'—';
export async function resolveMember(db,user){
 if(!user)return null;
 let d=await getDoc(doc(db,'members',user.uid));
 if(d.exists())return d.data().active===false?null:d.data();
 const email=String(user.email||'').toLowerCase();
 if(!email||user.email!==email||!user.emailVerified)return null;
 const inv=await getDoc(doc(db,'invites',email));
 if(!inv.exists()||inv.data().active!==true)return null;
 try{
  await setDoc(doc(db,'members',user.uid),{email:user.email,inviteEmail:email,role:inv.data().role,active:true,createdAt:serverTimestamp(),acceptedAt:serverTimestamp()});
 }catch(e){
  const check=await getDoc(doc(db,'members',user.uid));if(!check.exists())throw e;
 }
 d=await getDoc(doc(db,'members',user.uid));
 return d.exists()&&d.data().active!==false?d.data():null;
}
async function commitChange(target,changes,action,details,create=false){
 const a=doc(collection(state.db,'member_audit')),batch=writeBatch(state.db),ref=doc(state.db,target);
 const payload={...changes,updatedAt:serverTimestamp(),lastAuditId:a.id};
 if(create)batch.set(ref,{...payload,createdAt:serverTimestamp(),createdBy:state.user.uid});
 else batch.update(ref,payload);
 batch.set(a,{target,action,actorUid:state.user.uid,occurredAt:serverTimestamp(),details});
 await batch.commit();await loadMembers();
}
async function updateMember(id,change,action,description){
 if(id===state.user.uid)return msg('Không được tự đổi hoặc khóa tài khoản Admin của mình.');
 try{await commitChange('members/'+id,change,action,description);msg('Đã lưu thay đổi thành viên.')}
 catch(e){msg('Lỗi: '+e.message);await loadMembers()}
}
async function updateInvite(email,change,action,description){
 try{await commitChange('invites/'+email,change,action,description);msg('Đã lưu thay đổi lời mời.')}
 catch(e){msg('Lỗi: '+e.message);await loadMembers()}
}
function render(){
 node('memberRows').innerHTML=state.members.map(({id,data:d})=>{
  const self=id===state.user.uid;
  return '<tr><td>'+esc(d.email||id)+(self?' (Bạn)':'')+'</td><td><select aria-label="Vai trò thành viên" data-member-role="'+esc(id)+'" '+(self?'disabled':'')+'>'+
   Object.entries(roles).map(([k,v])=>'<option value="'+k+'" '+(d.role===k?'selected':'')+'>'+v+'</option>').join('')+
   '</select></td><td>'+(d.active===false?'Đã khóa':'Hoạt động')+'</td><td><button '+(self?'disabled':'')+' data-member-toggle="'+esc(id)+'">'+(d.active===false?'Mở quyền':'Khóa quyền')+'</button></td></tr>';
 }).join('')||'<tr><td colspan="4">Chưa có thành viên</td></tr>';
 node('inviteRows').innerHTML=state.invites.map(({id,data:d})=>'<tr><td>'+esc(id)+'</td><td><select aria-label="Vai trò lời mời" data-invite-role="'+esc(id)+'">'+
  Object.entries(roles).map(([k,v])=>'<option value="'+k+'" '+(d.role===k?'selected':'')+'>'+v+'</option>').join('')+
  '</select></td><td>'+(d.active===false?'Đã thu hồi':'Có hiệu lực')+'</td><td><button data-invite-toggle="'+esc(id)+'">'+(d.active===false?'Mở lại':'Thu hồi')+'</button></td></tr>').join('')||'<tr><td colspan="4">Chưa có lời mời</td></tr>';
 node('memberAuditRows').innerHTML=state.audit.map(({data:d})=>'<tr><td>'+esc(fmtTime(d.occurredAt))+'</td><td>'+esc(d.action)+'</td><td>'+esc(d.target)+'</td><td>'+esc(d.actorUid)+'</td><td>'+esc(d.details)+'</td></tr>').join('')||'<tr><td colspan="5">Chưa có nhật ký</td></tr>';
 document.querySelectorAll('[data-member-role]').forEach(e=>e.onchange=async()=>{
  const id=e.dataset.memberRole;if(!confirm('Đổi quyền thành '+roles[e.value]+'?'))return loadMembers();
  await updateMember(id,{role:e.value},'role_change','Đổi quyền thành '+e.value);
 });
 document.querySelectorAll('[data-member-toggle]').forEach(e=>e.onclick=async()=>{
  const id=e.dataset.memberToggle,d=state.members.find(x=>x.id===id)?.data;
  if(!d)return;const active=d.active===false;
  if(confirm((active?'Mở quyền':'Khóa quyền')+' cho '+(d.email||id)+'?'))
   await updateMember(id,{active},active?'enable':'disable',active?'Mở quyền truy cập':'Khóa quyền truy cập');
 });
 document.querySelectorAll('[data-invite-role]').forEach(e=>e.onchange=async()=>{
  const id=e.dataset.inviteRole;if(!confirm('Đổi quyền lời mời?'))return loadMembers();
  await updateInvite(id,{role:e.value},'role_change','Đổi quyền lời mời thành '+e.value);
 });
 document.querySelectorAll('[data-invite-toggle]').forEach(e=>e.onclick=async()=>{
  const id=e.dataset.inviteToggle,d=state.invites.find(x=>x.id===id)?.data;
  if(!d)return;const active=d.active===false;
  if(confirm((active?'Mở lại':'Thu hồi')+' lời mời '+id+'?'))
   await updateInvite(id,{active},active?'invite_enable':'invite_revoke',active?'Mở lại lời mời':'Thu hồi lời mời');
 });
}
async function loadMembers(){
 if(!state.db||!state.user)return;
 try{
  const [m,i,a]=await Promise.all([
   getDocs(query(collection(state.db,'members'),limit(300))),
   getDocs(query(collection(state.db,'invites'),limit(300))),
   getDocs(query(collection(state.db,'member_audit'),limit(300)))
  ]);
  state.members=m.docs.map(x=>({id:x.id,data:x.data()})).sort((a,b)=>String(a.data.email).localeCompare(String(b.data.email)));
  state.invites=i.docs.map(x=>({id:x.id,data:x.data()})).sort((a,b)=>a.id.localeCompare(b.id));
  state.audit=a.docs.map(x=>({id:x.id,data:x.data()})).sort((a,b)=>(b.data.occurredAt?.seconds||0)-(a.data.occurredAt?.seconds||0));
  render();
 }catch(e){msg('Không thể tải quản lý nhân viên: '+e.message)}
}
async function addInvite(){
 const email=String(node('memberEmail').value||'').trim().toLowerCase(),role=node('memberDefaultRole').value||'editor';
 if(!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)||email.length>254)return msg('Email không hợp lệ.');
 if(!Object.hasOwn(roles,role))return msg('Vai trò không hợp lệ.');
 if(state.invites.some(x=>x.id===email))return msg('Đã có lời mời. Hãy điều chỉnh trong danh sách.');
 if(!confirm('Thêm lời mời '+email+' với quyền '+roles[role]+'?'))return;
 try{
  await commitChange('invites/'+email,{email,role,active:true},'invite','Mời '+email+' với quyền '+role,true);
  node('memberEmail').value='';msg('Đã lưu lời mời. Nhân viên có thể đăng nhập Google bằng đúng email này.');
 }catch(e){msg('Tạo lời mời thất bại: '+e.message)}
}
export function mountMemberAdmin(db,user,role){
 const root=node('memberAdminMount');if(!root)return;
 if(!user||role!=='admin'){root.innerHTML='';state.user=null;return}
 state.db=db;state.user=user;
 root.innerHTML='<div class="panel" style="margin-top:18px">'+
  '<h2>Quản lý nhân viên · Spark</h2><p class="muted">Mời qua email. Nhân viên tự đăng nhập Google để kích hoạt. Khóa quyền sẽ chặn dữ liệu Firestore.</p>'+
  '<div class="controls"><label>Email nhân viên<input id="memberEmail" type="email" autocomplete="email" placeholder="nhanvien@congty.com" style="min-width:240px"></label>'+
  '<label>Vai trò<select id="memberDefaultRole"><option value="editor" selected>Editor – nhập dữ liệu</option><option value="viewer">Viewer – chỉ xem</option><option value="admin">Admin – quản trị</option></select></label>'+
  '<button class="primary" id="memberInviteButton">Thêm nhân viên</button><button id="membersReload">Làm mới</button></div>'+
  '<p class="notice" id="membersFeedback" role="status" aria-live="polite">Thao tác quản lý sẽ được lưu trong nhật ký.</p>'+
  '<h3>Thành viên đã đăng nhập</h3><div class="scroll"><table><thead><tr><th>Email</th><th>Quyền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="memberRows"></tbody></table></div>'+
  '<h3>Lời mời theo email</h3><div class="scroll"><table><thead><tr><th>Email</th><th>Quyền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="inviteRows"></tbody></table></div>'+
  '<h3>Nhật ký thay đổi</h3><div class="scroll"><table><thead><tr><th>Thời gian</th><th>Hành động</th><th>Đối tượng</th><th>Người thao tác (UID)</th><th>Chi tiết</th></tr></thead><tbody id="memberAuditRows"></tbody></table></div></div>';
 node('memberInviteButton').onclick=addInvite;node('membersReload').onclick=loadMembers;loadMembers();
}
