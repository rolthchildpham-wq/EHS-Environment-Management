import {collection,doc,serverTimestamp,setDoc} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
let db=null,user=null,role=null,getRows=()=>[],onSaved=()=>{},stream=null,scanner=null,scanLoop=0,locked=false;
const operational=x=>['stock_in','stock_out'].includes(x.kind);
function catalog(){
 const source=getRows().filter(operational);
 const category=$('qrStockGreen')?.checked?'Cây xanh':'XLNT';
 const map=new Map();
 const classified=new Map();
 for(const r of source){
  const code=String(r.code||'').trim(),group=String(r.group||'').trim();
  if(code&&['XLNT','Cây xanh'].includes(group))classified.set(code,group);
 }
 for(const r of source){
  const code=String(r.code||'').trim();
  if(!code)continue;
  const assigned=classified.get(code);
  // Untagged Excel materials remain selectable until categorized by a real QR issue.
  if(assigned&&assigned!==category)continue;
  const previous=map.get(code);
  if(!previous||r.kind==='stock_in')map.set(code,{code,name:String(r.name||previous?.name||code),unit:String(r.unit||previous?.unit||''),price:Number(r.price||previous?.price||0),unassigned:!assigned});
 }
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
function balance(code){
 return getRows().filter(r=>operational(r)&&String(r.code||'')===code)
  .reduce((s,r)=>s+(r.kind==='stock_in'?1:-1)*Number(r.quantity||0),0);
}
function status(message,isError=false){
 const root=$('qrStockStatus');if(root){root.textContent=message;root.dataset.error=isError?'true':'false'}
}
function refresh(){
 const list=catalog(),select=$('qrStockItem');if(!select)return;
 const before=select.value;
 select.innerHTML='<option value="">Chọn vật tư...</option>'+list.map(x=>'<option value="'+esc(x.code)+'">'+esc(x.code+' · '+x.name+' ('+x.unit+')')+'</option>').join('');
 select.value=list.some(x=>x.code===before)?before:'';
 suggestMaterial();updateStock();
 const history=getRows().filter(r=>operational(r)).sort((a,b)=>
  (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,8);
 $('qrStockRecent').innerHTML=history.map(r=>'<tr><td>'+esc(r.createdAt?.toDate?.().toLocaleString('vi-VN')||r.date||'')+'</td><td>'+esc(r.kind==='stock_in'?'Nhập':'Xuất')+'</td><td>'+esc(r.name||r.code)+'</td><td>'+fmt(r.quantity)+' '+esc(r.unit||'')+'</td></tr>').join('')||'<tr><td colspan="4">Chưa có giao dịch nhập/xuất.</td></tr>';
}
function updateStock(){
 const code=$('qrStockItem')?.value||'',item=catalog().find(x=>x.code===code);
 $('qrStockBalance').textContent=item?'Tồn theo giao dịch Nhập/Xuất đã lưu: '+fmt(balance(code))+' '+item.unit:'Chọn một mã vật tư để xem tồn';
}
function suggestMaterial(){
 const q=String($('qrStockSearch')?.value||'').toLocaleLowerCase('vi').trim();
 const options=catalog().filter(x=>!q||[x.name,x.code].some(z=>z.toLocaleLowerCase('vi').includes(q))).slice(0,30);
 $('qrStockSuggestions').innerHTML=options.map(x=>'<option value="'+esc(x.code+' · '+x.name)+'"></option>').join('');
 const exact=catalog().find(x=>x.code+' · '+x.name===$('qrStockSearch').value||x.code===$('qrStockSearch').value);
 if(exact){$('qrStockItem').value=exact.code;updateStock()}
}
function applyMaterialSearch(){
 const term=String($('qrStockSearch')?.value||'').trim();
 const found=catalog().find(x=>x.code+' · '+x.name===term||x.code===term||x.name.toLocaleLowerCase('vi')===term.toLocaleLowerCase('vi'));
 if(!found){status('Chưa có vật tư phù hợp. Hãy chọn một dòng gợi ý hoặc quét QR.',true);return}
 $('qrStockItem').value=found.code;updateStock();status('Đã chọn '+found.name+' ('+found.code+').');
}
function readCode(raw){
 const s=String(raw||'').trim();
 if(!s)return '';
 if(s.startsWith('{')){
  try{const d=JSON.parse(s);return String(d.code||d.sku||d.materialCode||'').trim().slice(0,100)}
  catch{return ''}
 }
 return s.replace(/^(?:EHS|SKU|MAT|VT)[:#-]/i,'').slice(0,100);
}
function selectCode(raw){
 const code=readCode(raw),list=catalog();
 if(!list.some(x=>x.code===code)){status('Mã QR '+(code||'không hợp lệ')+' chưa có trong danh mục nhập/xuất thực tế. Hãy chọn vật tư có sẵn hoặc nhập mã đúng.',true);return}
 $('qrStockItem').value=code;$('qrStockSearch').value=code+' · '+catalog().find(x=>x.code===code).name;updateStock();status('Đã nhận dạng mã '+code+'. Chọn Nhập hoặc Xuất và điền số lượng.');
}
function stopCamera(){
 scanLoop++;
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 const video=$('qrStockVideo');if(video){video.pause();video.srcObject=null;video.hidden=true}
 const stop=$('qrStockStop');if(stop)stop.hidden=true;
}
async function startCamera(){
 if(!('BarcodeDetector' in window)){status('Trình duyệt này chưa hỗ trợ quét QR trực tiếp. Dùng ô nhập/dán mã QR hoặc trình duyệt Chrome hỗ trợ BarcodeDetector.',true);return}
 if(!navigator.mediaDevices?.getUserMedia){status('Không thể mở camera: cần HTTPS và quyền camera.',true);return}
 stopCamera();
 try{
  scanner=new BarcodeDetector({formats:['qr_code']});
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const v=$('qrStockVideo');v.srcObject=stream;v.hidden=false;await v.play();$('qrStockStop').hidden=false;
  const loop=scanLoop;
  status('Đang quét QR. Đưa mã vật tư vào giữa khung hình.');
  const tick=async()=>{
   if(loop!==scanLoop||!stream)return;
   try{const codes=await scanner.detect(v);if(codes.length){selectCode(codes[0].rawValue);stopCamera();return}}
   catch(e){status('Không đọc được QR: '+e.message,true);stopCamera();return}
   requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
 }catch(e){stopCamera();status('Không mở được camera: '+e.message,true)}
}
function localDay(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
async function submit(e){
 e.preventDefault();
 if(locked||!db||!user||!['admin','editor'].includes(role)){status('Chỉ Admin/Editor được ghi nhập xuất.',true);return}
 const code=$('qrStockItem').value,kind=$('qrStockKind').value,qty=Number($('qrStockQuantity').value);
 const item=catalog().find(x=>x.code===code);
 if(!item||!['stock_in','stock_out'].includes(kind)||!Number.isFinite(qty)||qty<=0||!item.unit){status('Chọn vật tư có đơn vị, loại giao dịch và số lượng lớn hơn 0.',true);return}
 const available=balance(code);
 if(kind==='stock_out'&&qty>available+1e-8){status('Không đủ tồn: '+fmt(available)+' '+item.unit+'. Kiểm tra nhập kho, số dư đầu kỳ và dữ liệu Excel trước khi xuất.',true);return}
 locked=true;$('qrStockSave').disabled=true;
 try{
  const now=new Date(),note=String($('qrStockNote').value||'').trim().slice(0,1000);
  const category=$('qrStockGreen')?.checked?'Cây xanh':'XLNT';
  const payload={
   date:localDay(),kind,quantity:qty,unit:item.unit,name:item.name,code:item.code,
   spec:'',worker:'',note,price:kind==='stock_in'&&item.price>0?item.price:null,
   amount:kind==='stock_in'&&item.price>0?Number((item.price*qty).toFixed(2)):null,
   previous:null,meter:null,group:category,nameZh:'',sourceSheet:'QR',sourceRow:now.getTime(),
   sourceFile:'QR scan',year:now.getFullYear(),consumedQuantity:null,consumedUnit:'',
   costGroup:'',nameVi:'',importId:'qr_'+now.getTime(),createdBy:user.uid,createdAt:serverTimestamp()
  };
  await setDoc(doc(collection(db,'operations')),payload);
  $('qrStockQuantity').value='';$('qrStockNote').value='';
  status('Đã lưu '+(kind==='stock_in'?'NHẬP':'XUẤT')+' '+fmt(qty)+' '+item.unit+' · '+item.name+' · '+category+'. Thời gian do Firebase ghi tự động.');
  await onSaved();
  refresh();$('qrStockItem').value=code;updateStock();
 }catch(error){status('Lưu thất bại: '+error.message,true)}
 finally{locked=false;$('qrStockSave').disabled=false}
}
export function mountQrStock(database,actor,memberRole,rows,onUpdate){
 db=database;user=actor;role=memberRole;getRows=rows||(()=>[]);onSaved=onUpdate||(()=>{});
 const mount=$('qrStockMount');if(!mount)return;
 stopCamera();
 if(!user||!['admin','editor'].includes(role)){mount.innerHTML='<div class="panel"><h2>Quét QR · Vật tư</h2><p>Chỉ Admin/Editor có quyền nhập, xuất vật tư. Viewer chỉ được xem báo cáo.</p></div>';return}
 mount.innerHTML='<div class="panel qr-stock-panel"><div class="qr-stock-heading"><div><h2>Quét QR · Nhập / Xuất vật tư</h2><p class="muted">Quét mã QR trên vật tư; dùng danh mục đã có ở sheet Nhập/Xuất. Tự lưu thời gian giao dịch bằng Firebase.</p></div><span class="qr-tag">Giao dịch thực tế</span></div>'+
 '<form id="qrStockForm"><div class="qr-stock-controls"><label>Loại giao dịch<select id="qrStockKind"><option value="stock_out">Xuất / sử dụng</option><option value="stock_in">Nhập kho</option></select></label>'+
 '<div class="qr-category-picker" role="group" aria-label="Chọn nơi sử dụng vật tư"><label><input type="checkbox" id="qrStockWater" checked> XLNT</label><label><input type="checkbox" id="qrStockGreen"> Cây xanh</label></div>'+ 
 '<label>Tìm vật tư theo tên / mã<input id="qrStockSearch" list="qrStockSuggestions" autocomplete="off" placeholder="Gõ tên để hiện gợi ý..."><datalist id="qrStockSuggestions"></datalist></label>'+ 
 '<label>Loại vật tư<select id="qrStockItem" required></select></label>'+
 '<label>Số lượng<input id="qrStockQuantity" type="number" min="0.001" step="any" inputmode="decimal" required placeholder="0"></label>'+
 '<label>Ghi chú (không bắt buộc)<input id="qrStockNote" maxlength="1000" placeholder="Bộ phận / mục đích sử dụng"></label>'+
 '<button id="qrStockSave" class="primary" type="submit">Lưu giao dịch</button></div></form>'+
 '<div class="qr-qr-link"><div><strong>QR mở Nhật ký trên điện thoại</strong><p class="muted">Chỉ tài khoản Admin/Editor được ghi; vật tư sẽ được chọn trên điện thoại.</p></div><button id="qrLinkCreate" type="button">Tạo QR link</button><a id="qrLinkText" href="?tab=records" target="_blank" rel="noopener">Mở liên kết Nhật ký</a><div id="qrLinkImage" aria-label="Mã QR mở Nhật ký"></div></div>'+
 '<div class="qr-stock-utility"><button id="qrStockStart" type="button">Mở camera quét QR</button><button id="qrStockStop" type="button" hidden>Dừng camera</button>'+
 '<label>Nhập mã QR thủ công<input id="qrStockCode" placeholder="Mã vật tư từ QR"></label><button id="qrStockApply" type="button">Chọn mã</button></div>'+
 '<video id="qrStockVideo" playsinline muted hidden></video><p id="qrStockBalance" class="muted"></p>'+
 '<p id="qrStockStatus" role="status" aria-live="polite">Chưa ghi giao dịch.</p>'+
 '<details><summary>8 giao dịch gần nhất</summary><div class="scroll"><table><thead><tr><th>Thời gian</th><th>Loại</th><th>Vật tư</th><th>Số lượng</th></tr></thead><tbody id="qrStockRecent"></tbody></table></div></details></div>';
 const changeCategory=green=>{
  $('qrStockGreen').checked=green;$('qrStockWater').checked=!green;
  $('qrStockSearch').value='';refresh();
 };
 $('qrStockWater').onchange=()=>changeCategory(false);
 $('qrStockGreen').onchange=()=>changeCategory(true);
 $('qrStockForm').onsubmit=submit;$('qrStockItem').onchange=()=>{const x=catalog().find(x=>x.code===$('qrStockItem').value);$('qrStockSearch').value=x?x.code+' · '+x.name:'';updateStock()};
 $('qrStockSearch').oninput=suggestMaterial;$('qrStockSearch').onchange=applyMaterialSearch;
 $('qrStockStart').onclick=startCamera;$('qrStockStop').onclick=stopCamera;
 $('qrStockApply').onclick=()=>selectCode($('qrStockCode').value);
 $('qrLinkCreate').onclick=()=>{
  const url=new URL(location.pathname,location.origin);url.searchParams.set('tab','records');
  $('qrLinkText').href=url.href;$('qrLinkText').textContent=url.href;
  const target=$('qrLinkImage');target.innerHTML='';
  if(typeof window.QRCode==='function')new window.QRCode(target,{text:url.href,width:160,height:160,correctLevel:window.QRCode.CorrectLevel.M});
  else status('Không tải được thư viện tạo QR. Có thể sao chép liên kết Nhật ký.',true);
 };
 refresh();
}
export function unmountQrStock(){stopCamera();db=null;user=null;role=null;const mount=$('qrStockMount');if(mount)mount.innerHTML=''}
