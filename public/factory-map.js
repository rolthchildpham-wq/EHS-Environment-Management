import {doc,getDoc,setDoc,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let db=null,user=null,role=null,state={image:'',pins:[]},busy=false;
const hint=s=>{$('mapStatus').textContent=s};
function renderMap(){
 const img=$('factoryMapImage'),zone=$('factoryMapZone'),empty=$('mapEmpty');
 if(!zone)return;
 img.style.display=state.image?'block':'none';empty.style.display=state.image?'none':'block';
 if(state.image&&img.src!==state.image)img.src=state.image;
 $('mapAnnotations').innerHTML=state.pins.map(p=>
   '<button type="button" class="factory-pin" data-pin="'+esc(p.id)+'" style="left:'+p.x+'%;top:'+p.y+'%;background:'+esc(p.color||'#0f766e')+';" title="'+esc(p.title)+'" aria-label="'+esc(p.title)+'">📍</button>'
 ).join('');
 $('mapPinRows').innerHTML=state.pins.map(p=>'<tr><td>'+esc(p.title)+'</td><td>'+esc(p.kind)+'</td><td>'+esc(p.note)+'</td><td>'+esc(p.x.toFixed(1))+', '+esc(p.y.toFixed(1))+'%</td><td>'+
 (role==='admin'?'<button data-edit="'+esc(p.id)+'">Sửa</button> <button data-drop="'+esc(p.id)+'">Xóa</button>':'Chỉ xem')+'</td></tr>').join('')||'<tr><td colspan="5">Chưa có điểm chú thích.</td></tr>';
 for(const b of document.querySelectorAll('[data-pin]'))b.onclick=e=>{e.stopPropagation();editPin(b.dataset.pin)};
 for(const b of document.querySelectorAll('[data-edit]'))b.onclick=()=>editPin(b.dataset.edit);
 for(const b of document.querySelectorAll('[data-drop]'))b.onclick=()=>removePin(b.dataset.drop);
 $('mapEditorControls').hidden=role!=='admin';
}
async function compress(file){
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 for(const q of [.8,.66,.52,.38]){
  const image=canvas.toDataURL('image/jpeg',q);
  if(image.length<680000)return image;
 }
 throw Error('Ảnh quá lớn. Hãy giảm kích thước ảnh trước khi tải.');
}
async function save(){
 if(!db||role!=='admin'||busy)return;
 busy=true;hint('Đang lưu bản đồ và chú thích lên Firestore…');
 try{
  await setDoc(doc(db,'settings','factoryMap'),{image:state.image,pins:state.pins,updatedAt:serverTimestamp(),updatedBy:user.uid});
  hint('Đã lưu bản đồ và '+state.pins.length+' chú thích. Các nhân viên có quyền có thể xem.');
 }catch(e){hint('Lưu bản đồ thất bại: '+e.message)}
 finally{busy=false}
}
function editPin(id,point){
 if(role!=='admin')return;
 const index=state.pins.findIndex(x=>x.id===id),existing=state.pins[index]||{};
 const title=prompt('Tên vị trí (ví dụ: Trạm xử lý nước thải, Kho PAC, Điểm tập kết rác):',existing.title||'');
 if(title===null)return;
 if(!title.trim()||title.length>100)return hint('Tên vị trí không hợp lệ.');
 const note=prompt('Ghi chú / thông số / trách nhiệm:',existing.note||'');
 if(note===null)return;
 if(note.length>600)return hint('Ghi chú quá dài (tối đa 600 ký tự).');
 const kind=prompt('Nhóm: XLNT, Rác, Vật tư, Hóa chất, Cây xanh, Khác',existing.kind||'Khác');
 if(kind===null)return;
 if(kind.length>70)return hint('Nhóm quá dài.');
 const pin={id:existing.id||crypto.randomUUID(),x:point?.x??existing.x??50,y:point?.y??existing.y??50,
  title:title.trim(),kind:kind.trim()||'Khác',note:note.trim(),color:'#0f766e'};
 if(index>=0)state.pins[index]=pin;else state.pins.push(pin);
 renderMap();save();
}
function removePin(id){
 if(role!=='admin'||!confirm('Xóa chú thích này khỏi sơ đồ?'))return;
 state.pins=state.pins.filter(x=>x.id!==id);renderMap();save();
}
export async function mountFactoryMap(database,actor,actorRole){
 db=database;user=actor;role=actorRole;
 const zone=$('factoryMapZone');if(!zone)return;
 if(!user||!role){state={image:'',pins:[]};renderMap();hint('Đăng nhập để xem bản đồ nhà máy.');return}
 try{
  const snap=await getDoc(doc(db,'settings','factoryMap'));
  if(snap.exists()){const data=snap.data();state={image:data.image||'',pins:Array.isArray(data.pins)?data.pins.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)):[]}}
  else state={image:'',pins:[]};
  renderMap();hint(state.image?'Đã tải sơ đồ và chú thích chung từ Firestore.':'Chưa có sơ đồ nhà máy. Admin có thể tải ảnh lên.');
 }catch(e){hint('Không đọc được sơ đồ: '+e.message)}
}
export function initFactoryMap(){
 const zone=$('factoryMapZone');if(!zone)return;
 $('mapFile').onchange=async e=>{
  if(role!=='admin')return hint('Chỉ Admin được đổi ảnh nhà máy.');
  const file=e.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/'))return hint('Chỉ chấp nhận tệp ảnh.');
  try{state.image=await compress(file);renderMap();await save()}
  catch(err){hint(err.message)}
 };
 zone.addEventListener('click',e=>{
  if(role!=='admin'||!state.image)return;
  const box=$('factoryMapImage').getBoundingClientRect();
  if(!box.width||!box.height)return;
  const x=(e.clientX-box.left)/box.width*100,y=(e.clientY-box.top)/box.height*100;
  if(x<0||x>100||y<0||y>100)return;
  editPin(null,{x:Number(x.toFixed(2)),y:Number(y.toFixed(2))});
 });
 $('mapClearPins').onclick=()=>{
  if(role!=='admin'||!confirm('Xóa tất cả chú thích? Ảnh sơ đồ được giữ lại.'))return;
  state.pins=[];renderMap();save();
 };
 renderMap();
}
