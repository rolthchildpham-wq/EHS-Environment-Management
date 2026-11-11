import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,addDoc,getDocs,query,limit,serverTimestamp,updateDoc} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const el=id=>document.getElementById(id);
const fmt=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={waste:'Rác thải',water_in:'Nước vào',water_out:'Nước ra',stock_in:'Nhập vật tư',stock_out:'Xuất vật tư',cost:'Chi phí',revenue:'Doanh thu'};
const labels={dashboard:'Tổng quan',records:'Nhật ký',finance:'Tài chính',map:'Bản đồ',import:'Nhập liệu & AI',reports:'Báo cáo',admin:'Quản trị'};
let data=[],pending=[],reviewData=[],user=null,role=null,db=null,auth=null,charts={};
const notice=s=>el('notice').textContent=s;
const date=x=>String(x||'').slice(0,10);
const norm=x=>({date:date(x.date),kind:x.kind,value:Number(x.value),unit:String(x.unit||''),name:String(x.name||''),note:String(x.note||''),source:String(x.source||'excel')});
const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Object.hasOwn(names,x.kind)&&Number.isFinite(x.value)&&x.value>=0;
const sum=(a,k)=>a.filter(x=>x.kind===k).reduce((s,x)=>s+x.value,0);
const current=()=>[...data,...reviewData].filter(x=>x.date>=el('from').value&&x.date<=el('to').value);
function previous(){
 const a=new Date(el('from').value+'T00:00:00Z'),b=new Date(el('to').value+'T00:00:00Z');
 if(isNaN(a)||isNaN(b))return [];
 if(el('comparison').value==='yoy'){a.setUTCFullYear(a.getUTCFullYear()-1);b.setUTCFullYear(b.getUTCFullYear()-1)}
 else {const n=Math.round((b-a)/86400000)+1;b.setTime(a.getTime()-86400000);a.setTime(b.getTime()-(n-1)*86400000)}
 const x=a.toISOString().slice(0,10),y=b.toISOString().slice(0,10);
 return [...data,...reviewData].filter(r=>r.date>=x&&r.date<=y);
}
function stat(title,v,unit,p){return '<div class="stat"><div class="muted">'+esc(title)+'</div><strong>'+fmt(v)+' <small>'+esc(unit)+'</small></strong><span class="muted">'+(p?fmt((v-p)/p*100)+'% so kỳ trước':'Chưa đủ dữ liệu so sánh')+'</span></div>'}
function monthly(r,k){const n=Array(12).fill(0);r.filter(x=>x.kind===k).forEach(x=>{const m=Number(x.date.slice(5,7));if(m>=1&&m<=12)n[m-1]+=x.value});return n}
function chart(id,type,labels,sets){if(!window.Chart)return;if(charts[id])charts[id].destroy();charts[id]=new window.Chart(el(id),{type,data:{labels,datasets:sets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}})}
function render(){
 const r=current(),p=previous(),months=Array.from({length:12},(_,i)=>'T'+(i+1));
 el('stats').innerHTML=stat('Rác thu gom',sum(r,'waste'),'kg',sum(p,'waste'))+stat('Nước thải đầu ra',sum(r,'water_out'),'m³',sum(p,'water_out'))+stat('Số dòng nhập vật tư',r.filter(x=>x.kind==='stock_in').length,'dòng',0)+stat('Số dòng xuất vật tư',r.filter(x=>x.kind==='stock_out').length,'dòng',0);
 chart('wasteChart','bar',months,[{label:'Rác (kg)',data:monthly(r,'waste'),backgroundColor:'#168982'}]);
 chart('waterChart','line',months,[{label:'Đầu vào',data:monthly(r,'water_in'),borderColor:'#db983e'},{label:'Đầu ra',data:monthly(r,'water_out'),borderColor:'#268cb8'}]);
 const groups={};r.filter(x=>x.kind==='waste').forEach(x=>groups[x.name||'Khác']=(groups[x.name||'Khác']||0)+x.value);
 const top=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,8);
 chart('categoryChart','doughnut',top.map(x=>x[0]),[{data:top.map(x=>x[1])}]);
 chart('moneyChart','bar',months,[{label:'Chi phí',data:monthly(r,'cost'),backgroundColor:'#d18c52'},{label:'Doanh thu',data:monthly(r,'revenue'),backgroundColor:'#128e77'}]);
 el('recordRows').innerHTML=r.filter(x=>el('kind').value==='all'||x.kind===el('kind').value).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,1500).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(names[x.kind])+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.value)+'</td><td>'+esc(x.unit)+'</td><td>'+esc(x.source)+'</td></tr>').join('');
 const cost=sum(r,'cost'),revenue=sum(r,'revenue');
 const wc=r.filter(x=>x.kind==='cost'&&x.name==='water_cost').reduce((s,x)=>s+x.value,0);
 const water=sum(r,'water_out');
 el('financeStats').innerHTML=stat('Chi phí',cost,'VND',sum(p,'cost'))+stat('Doanh thu',revenue,'VND',sum(p,'revenue'))+stat('Chênh lệch',revenue-cost,'VND',sum(p,'revenue')-sum(p,'cost'))+stat('Chi phí nước / m³',water&&wc?wc/water:0,water&&wc?'VND/m³':'thiếu dữ liệu',0);
 el('financeRows').innerHTML=months.map((m,i)=>'<tr><td>'+m+'</td><td>'+fmt(monthly(r,'cost')[i])+'</td><td>'+fmt(monthly(r,'revenue')[i])+'</td><td>'+fmt(monthly(r,'revenue')[i]-monthly(r,'cost')[i])+'</td></tr>').join('');
 el('reportBody').innerHTML='<h3>Kỳ: '+esc(el('from').value)+' – '+esc(el('to').value)+'</h3><table><thead><tr><th>Chỉ tiêu</th><th>Kỳ này</th><th>Kỳ so sánh</th><th>Thay đổi</th></tr></thead><tbody>'+Object.keys(names).map(k=>{const a=sum(r,k),b=sum(p,k);return '<tr><td>'+esc(names[k])+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td><td>'+(b?fmt((a-b)/b*100)+'%':'Thiếu dữ liệu')+'</td></tr>'}).join('')+'</tbody></table><p class="muted">Không cộng các vật tư khác đơn vị để tính tồn kho.</p>';
}
function preview(){el('preview').innerHTML=pending.slice(0,500).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(names[x.kind])+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.value)+'</td><td>'+esc(x.unit)+'</td><td>'+esc(x.note)+'</td></tr>').join('')}
function rows(){return current().map(x=>({'Ngày':x.date,'Loại':names[x.kind],'Tên':x.name,'Số lượng':x.value,'Đơn vị':x.unit,'Ghi chú':x.note,'Nguồn':x.source}))}
function xlsxExport(filename){if(!window.XLSX)return alert('Không tải được XLSX');const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows()),'Du lieu');XLSX.writeFile(book,filename)}
function parseSheet(rows){
 const dict={'rac':'waste','rac thai':'waste','nuoc vao':'water_in','nuoc ra':'water_out','nhap vat tu':'stock_in','xuat vat tu':'stock_out','chi phi':'cost','doanh thu':'revenue'};
 return rows.map(row=>{const obj=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim(),v]));
 let d=obj.ngay??obj.date;
 if(typeof d==='number'){const z=XLSX.SSF.parse_date_code(d);d=z?z.y+'-'+String(z.m).padStart(2,'0')+'-'+String(z.d).padStart(2,'0'):''}
 if(d instanceof Date)d=d.toISOString().slice(0,10);
 let k=String(obj.loai??obj.kind??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 k=dict[k]||k;
 return norm({date:d,kind:k,value:obj['so luong']??obj['so_luong']??obj.value,unit:obj['don vi']??obj['don_vi'],name:obj.ten??obj.name,note:obj['ghi chu'],source:'excel'});
 }).filter(valid);
}
async function reload(){
 if(!db||!role)return;
 const snap=await getDocs(query(collection(db,'records'),limit(5000)));
 data=snap.docs.map(d=>norm(d.data())).filter(valid);
 await reviews();render();notice('Đã tải '+data.length+' bản ghi gốc và '+reviewData.length+' chứng từ đã duyệt. Tối đa 5000 bản ghi gốc.');
}
async function reviews(){
 if(!db||!role)return;
 const snap=await getDocs(query(collection(db,'reviews'),limit(1000)));
 reviewData=snap.docs.filter(d=>d.data().status==='approved').map(d=>norm(d.data())).filter(valid);
 el('reviews').innerHTML=snap.docs.map(d=>{
  const x=d.data();
  return '<tr><td>'+esc(d.id)+'</td><td>'+esc(x.status)+'</td><td>1</td><td>'+(
   x.status==='pending'&&role==='admin'
   ?'<button data-review="'+esc(d.id)+'" data-status="approved">Phê duyệt</button> <button data-review="'+esc(d.id)+'" data-status="rejected">Từ chối</button>'
   :'')+'</td></tr>';
 }).join('');
 document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{
  if(!user||role!=='admin'||!confirm((b.dataset.status==='approved'?'Phê duyệt':'Từ chối')+' chứng từ này?'))return;
  b.disabled=true;
  try {
   await updateDoc(doc(db,'reviews',b.dataset.review),{
    status:b.dataset.status,reviewedBy:user.uid,reviewedAt:serverTimestamp()
   });
   await reload();
  }catch(e){alert('Không thể phê duyệt: '+e.message);b.disabled=false}
 });
}

el('tabs').innerHTML=Object.entries(labels).map(([id,title],i)=>'<button data-tab="'+id+'" class="'+(i===0?'active':'')+'">'+title+'</button>').join('');
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('section').forEach(s=>s.classList.toggle('active',s.id===b.dataset.tab));document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b))});
el('refresh').onclick=render;el('kind').onchange=render;el('exportExcel').onclick=()=>xlsxExport('EHS_du_lieu.xlsx');el('reportExcel').onclick=()=>xlsxExport('EHS_bao_cao.xlsx');
el('printReport').onclick=()=>{const w=window.open('','_blank');if(!w)return alert('Bật popup để in');w.document.write('<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}</style></head><body><h1>BÁO CÁO EHS</h1>'+el('reportBody').innerHTML+'</body></html>');w.document.close();w.print()};
el('reportPpt').onclick=()=>{if(!window.pptxgen)return alert('Không tải được PowerPoint');const p=new window.pptxgen();p.layout='LAYOUT_WIDE';const s=p.addSlide();s.addText('BÁO CÁO MÔI TRƯỜNG EHS',{x:.6,y:.6,w:11,h:.7,fontSize:27,bold:true});s.addText(el('from').value+' – '+el('to').value,{x:.6,y:1.5,w:10,h:.5,fontSize:18});['waste','water_in','water_out','cost','revenue'].forEach((k,i)=>s.addText(names[k]+': '+fmt(sum(current(),k)),{x:.7,y:2.2+i*.7,w:10,h:.5,fontSize:18}));p.writeFile({fileName:'EHS_bao_cao.pptx'})};
el('mapFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{el('mapCanvas').style.background='center/contain no-repeat url('+JSON.stringify(reader.result)+')'};reader.readAsDataURL(f)};
el('parseExcel').onclick=async()=>{const f=el('excelFile').files[0];if(!f)return alert('Chọn file Excel');try{if(!window.XLSX)throw Error('Không tải được XLSX');const book=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});pending=book.SheetNames.flatMap(n=>parseSheet(XLSX.utils.sheet_to_json(book.Sheets[n],{defval:null})));preview();el('importStatus').textContent='Đọc được '+pending.length+' dòng hợp lệ. Chỉ hỗ trợ định dạng cột chuẩn.'}catch(e){el('importStatus').textContent=e.message}};
el('saveImport').onclick=async()=>{if(!pending.length)return alert('Chưa có dữ liệu');if(!db||!user||!['admin','editor'].includes(role))return alert('Bạn cần quyền editor/admin');if(!confirm('Lưu '+pending.length+' dòng?'))return;try{for(const x of pending)await addDoc(collection(db,'records'),{...x,createdBy:user.uid,createdAt:serverTimestamp()});pending=[];preview();await reload()}catch(e){alert(e.message)}};
el('aiRead').disabled=true;
el('aiRead').textContent='AI cần backend riêng';
el('aiStatus').textContent='Spark: chưa hỗ trợ AI tự động. Vui lòng nhập thủ công số liệu từ ảnh để quản trị viên kiểm duyệt.';
el('submitEvidence').onclick=async()=>{
 if(!user||!['admin','editor'].includes(role))return alert('Cần đăng nhập và quyền editor/admin.');
 const x=norm({
   date:el('evidenceDate').value,
   kind:el('evidenceField').value,
   value:el('evidenceValue').value,
   unit:el('evidenceUnit').value,
   name:el('evidenceName').value,
   note:el('evidenceNote').value,
   source:'manual_photo'
 });
 if(!valid(x)||!el('evidenceValue').value.trim())return alert('Kiểm tra lại ngày, loại và số lượng.');
 if(!confirm('Gửi bản ghi từ ảnh để quản trị viên phê duyệt?'))return;
 try{
  await addDoc(collection(db,'reviews'),{
   ...x,status:'pending',createdBy:user.uid,createdAt:serverTimestamp()
  });
  el('aiStatus').textContent='Đã tạo phiếu chờ phê duyệt; dữ liệu chưa được tính vào báo cáo.';
  await reviews();
 }catch(e){alert('Lỗi tạo phiếu duyệt: '+e.message)}
};
const localEvidence=el('evidenceFile');
localEvidence.onchange=()=>{
 const file=localEvidence.files?.[0];
 if(!file)return;
 if(!file.type.startsWith('image/'))return alert('Chỉ chọn ảnh');
 const view=el('evidencePreview');
 if(view.dataset.url)URL.revokeObjectURL(view.dataset.url);
 view.dataset.url=URL.createObjectURL(file);
 view.src=view.dataset.url;
 view.classList.remove('hide');
};

el('login').onclick=()=>auth&&signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>alert(e.message));
el('logout').onclick=()=>auth&&signOut(auth);
if(window.EHS_FIREBASE_CONFIG){
 const app=initializeApp(window.EHS_FIREBASE_CONFIG);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async u=>{user=u;role=null;el('login').classList.toggle('hide',!!u);el('logout').classList.toggle('hide',!u);if(!u){el('mode').textContent='Chưa đăng nhập';data=[];reviewData=[];render();return}try{const snap=await getDoc(doc(db,'members',u.uid));role=snap.exists()?snap.data().role:null;el('mode').textContent=u.email+' · '+(role||'chưa cấp quyền');if(role)await reload();else notice('Chưa được cấp quyền; tạo members/'+u.uid+' trong Firestore Console.')}catch(e){notice(e.message)}});
}else{el('mode').textContent='Chưa cấu hình Firebase';el('login').classList.add('hide');render();notice('Chưa kết nối Firebase Web App. Thêm cấu hình từ Project settings để kích hoạt.')}
