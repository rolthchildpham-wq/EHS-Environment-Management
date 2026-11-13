import {initCostExplorer,setCostExplorerRecords} from './ehs-cost-detail.js?v=20261112f';
import {initFactoryMap,mountFactoryMap} from './factory-map.js?v=20261112f';
import {initCompliance,mountCompliance,refreshCompliance} from './ehs-compliance.js?v=20261112f';
import {installI18n,t} from './i18n.js?v=20261112f';
import {mountDataReset} from './data-reset.js?v=20261112f';
import {mountOperations,unmountOperations,loadOperations,getOperationalRecords,getAllOperations,renderOperationsReport} from './ehs-operations.js?v=20261112f';
import {resolveMember,mountMemberAdmin} from './member-admin.js?v=20261112f';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,addDoc,getDocs,query,limit,serverTimestamp,updateDoc} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const el=id=>document.getElementById(id);
const fmt=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={waste:'Rác thải',water_in:'Nước vào',water_out:'Nước ra',stock_in:'Nhập vật tư',stock_out:'Xuất vật tư',cost:'Chi phí',revenue:'Doanh thu'};
const labels={dashboard:'Tổng quan',records:'Nhật ký',finance:'Tài chính',map:'Bản đồ',import:'Nhập liệu & Excel',reports:'Báo cáo',admin:'Quản trị',compliance:'Chỉ số EHS & ISO'};
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
function stat(title,v,unit,p){
 const icon=/rác|waste/i.test(title)?'♻':/nước|water/i.test(title)?'≋':/nhập|stock.in/i.test(title)?'↧':/xuất|stock.out/i.test(title)?'↥':/doanh thu|revenue/i.test(title)?'↗':/chi phí|cost/i.test(title)?'◈':'◉';
 const change=p?((v-p)/Math.abs(p))*100:null;
 const delta=change===null?'<span>'+esc(t('Chưa đủ dữ liệu so sánh'))+'</span>':
   '<span class="stat-delta '+(change<0?'down':'')+'">'+(change>0?'+':'')+fmt(change)+'%</span><span>'+esc(t('So với kỳ đối chiếu'))+'</span>';
 return '<div class="stat"><span class="stat-icon" aria-hidden="true">'+icon+'</span>'+
  '<div class="muted">'+esc(title)+'</div><strong>'+fmt(v)+' <small>'+esc(unit)+'</small></strong>'+
  '<div class="stat-bottom">'+delta+'</div></div>';
}
function monthly(r,k){const n=Array(12).fill(0);r.filter(x=>x.kind===k).forEach(x=>{const m=Number(x.date.slice(5,7));if(m>=1&&m<=12)n[m-1]+=x.value});return n}
function chart(id,type,labels,sets){
 if(!window.Chart)return;
 if(charts[id])charts[id].destroy();
 const ctx=el(id);if(!ctx)return;
 const isDoughnut=type==='doughnut';
 const polished=sets.map((set,i)=>{
  const color=['#108e83','#2999bd','#eaa34f','#896dd5'][i%4];
  return {...set,
   borderWidth:isDoughnut?2:type==='line'?2.5:0,
   borderRadius:type==='bar'?5:0,
   maxBarThickness:37,
   borderColor:set.borderColor||color,
   pointBackgroundColor:set.borderColor||color,
   pointBorderColor:'#fff',
   pointBorderWidth:type==='line'?2:0,
   pointRadius:type==='line'?3:0,
   pointHoverRadius:5,
   tension:type==='line'?.36:0,
   fill:type==='line'?false:undefined,
   hoverOffset:isDoughnut?8:0
  }
 });
 charts[id]=new window.Chart(ctx,{
  type,
  data:{labels,datasets:polished},
  options:{
   responsive:true,maintainAspectRatio:false,
   interaction:{mode:'index',intersect:false},
   animation:{duration:550,easing:'easeOutQuart'},
   cutout:isDoughnut?'70%':undefined,
   layout:{padding:{top:12,bottom:2}},
   plugins:{
    legend:{position:'bottom',align:'center',labels:{color:'#617689',font:{family:'Inter, Segoe UI, Arial',size:11,weight:600},boxWidth:11,boxHeight:11,usePointStyle:true,padding:15}},
    tooltip:{backgroundColor:'#142e43',titleColor:'#fff',bodyColor:'#d8e9f1',cornerRadius:9,padding:12,displayColors:true}
   },
   scales:isDoughnut?{}:{
    x:{grid:{display:false},border:{display:false},ticks:{color:'#8c9dad',font:{size:10}}},
    y:{beginAtZero:true,grid:{color:'#edf2f6',lineWidth:1},border:{display:false},ticks:{color:'#8c9dad',font:{size:10},maxTicksLimit:6,callback:v=>Number(v).toLocaleString('vi-VN')}}
   }
  }
 });
}
function updateYearOptions(){
 const select=el('dashboardYear');if(!select)return;
 const all=[...data,...reviewData];
 const years=new Set([2025,2026,new Date().getFullYear()]);
 for(const row of all){const y=Number(String(row.date||'').slice(0,4));if(y>=2000&&y<=2100)years.add(y)}
 const chosen=select.value||String(new Date().getFullYear());
 select.innerHTML=[...years].sort((a,b)=>b-a).map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 select.value=years.has(Number(chosen))?chosen:String(new Date().getFullYear());
}
function renderExecutiveInsights(rows){
 const element=el('executiveInsights');if(!element)return;
 const wastewater=sum(rows,'water_out'),waste=sum(rows,'waste');
 const spend=sum(rows,'cost'),income=sum(rows,'revenue');
 const total=rows.length;
 const cards=[
  {icon:'◎',title:t('Phạm vi dữ liệu'),detail:total?fmt(total)+' '+t('bản ghi theo kỳ')+'.':t('Chưa có bản ghi trong kỳ')},
  {icon:'≋',title:t('Hiệu quả kiểm soát nước'),detail:wastewater?fmt(wastewater)+' m³ '+t('nước thải đầu ra ghi nhận')+'.':t('Chưa có nước thải đầu ra ghi nhận')},
  {icon:'◈',title:t('Thu – chi môi trường'),detail:(spend||income)?t('Thu')+' '+fmt(income)+' / '+t('Chi')+' '+fmt(spend)+' VND.':t('Chưa có đủ chứng từ chi phí và doanh thu')}
 ];
 element.innerHTML=cards.map(x=>'<article class="ehs-insight"><span class="insight-symbol" aria-hidden="true">'+x.icon+
  '</span><div><h4>'+esc(x.title)+'</h4><p>'+esc(x.detail)+'</p></div></article>').join('');
}

function render(){
 const year=el('dashboardYear')?.value||'2026';
 for(const id of ['chartYearWaste','chartYearWater','chartYearCategory','chartYearMoney']){
  if(el(id))el(id).textContent=' · '+year;
 }
 const r=current(),p=previous(),months=Array.from({length:12},(_,i)=>'T'+(i+1));
 if(el('dashboardPeriodLabel'))el('dashboardPeriodLabel').textContent=el('from').value+' → '+el('to').value;
 renderExecutiveInsights(r);
 el('stats').innerHTML=stat(t('Rác thu gom'),sum(r,'waste'),'kg',sum(p,'waste'))+stat(t('Nước thải đầu ra'),sum(r,'water_out'),'m³',sum(p,'water_out'))+stat(t('Số dòng nhập vật tư'),r.filter(x=>x.kind==='stock_in').length,'dòng',0)+stat(t('Số dòng xuất vật tư'),r.filter(x=>x.kind==='stock_out').length,'dòng',0);
 chart('wasteChart','bar',months,[{label:t('Rác (kg)'),data:monthly(r,'waste'),backgroundColor:'#168982'}]);
 chart('waterChart','line',months,[{label:t('Đầu vào'),data:monthly(r,'water_in'),borderColor:'#db983e'},{label:t('Đầu ra'),data:monthly(r,'water_out'),borderColor:'#268cb8'}]);
 const groups={};r.filter(x=>x.kind==='waste').forEach(x=>groups[x.name||'Khác']=(groups[x.name||'Khác']||0)+x.value);
 const top=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,8);
 chart('categoryChart','doughnut',top.map(x=>x[0]),[{data:top.map(x=>x[1])}]);
 chart('moneyChart','bar',months,[{label:t('Chi phí'),data:monthly(r,'cost'),backgroundColor:'#d18c52'},{label:t('Doanh thu'),data:monthly(r,'revenue'),backgroundColor:'#128e77'}]);
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
 await loadOperations();setCostExplorerRecords(getAllOperations());data.push(...getOperationalRecords());
 await reviews();updateYearOptions();render();refreshCompliance();notice('Đã tải '+data.length+' bản ghi dữ liệu gốc/nghiệp vụ và '+reviewData.length+' chứng từ đã duyệt. Bảng báo cáo nghiệp vụ hiển thị chi tiết theo sheet Excel.');
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

installI18n();
const navIcons={dashboard:'◫',records:'≡',finance:'◈',map:'⌖',import:'↥',reports:'▤',admin:'⚙',compliance:'✧'};
el('tabs').innerHTML=Object.entries(labels).map(([id,title],i)=>
 '<button data-tab="'+id+'" class="'+(i===0?'active':'')+'"><span class="nav-ico" aria-hidden="true">'+(navIcons[id]||'•')+'</span><span>'+t(title)+'</span></button>'
).join('');
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('section').forEach(s=>s.classList.toggle('active',s.id===b.dataset.tab));document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b))});
el('dashboardYear').onchange=()=>{
 const y=Number(el('dashboardYear').value);if(!Number.isFinite(y))return;
 el('from').value=y+'-01-01';el('to').value=y+'-12-31';
 render();renderOperationsReport();refreshCompliance();
};
const syncYear=()=>{
 const y1=el('from').value.slice(0,4),y2=el('to').value.slice(0,4);
 if(y1===y2&&[...el('dashboardYear').options].some(o=>o.value===y1))el('dashboardYear').value=y1;
 render();renderOperationsReport();
};
el('from').onchange=syncYear;el('to').onchange=syncYear;
document.addEventListener('ehs-language-change',()=>{render();renderOperationsReport()});
el('refresh').onclick=async()=>{await reload();};el('kind').onchange=render;el('exportExcel').onclick=()=>xlsxExport('EHS_du_lieu.xlsx');el('reportExcel').onclick=()=>xlsxExport('EHS_bao_cao.xlsx');
el('printReport').onclick=()=>{const w=window.open('','_blank');if(!w)return alert('Bật popup để in');w.document.write('<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:30px;font-size:12px}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}td,th{border:1px solid #ddd;padding:6px}button,.controls{display:none}</style></head><body><h1>BÁO CÁO EHS</h1>'+el('reportBody').innerHTML+el('opsReport').innerHTML+'</body></html>');w.document.close();w.print()};
el('reportPpt').onclick=()=>{if(!window.pptxgen)return alert('Không tải được PowerPoint');const p=new window.pptxgen();p.layout='LAYOUT_WIDE';const s=p.addSlide();s.addText('BÁO CÁO MÔI TRƯỜNG EHS',{x:.6,y:.6,w:11,h:.7,fontSize:27,bold:true});s.addText(el('from').value+' – '+el('to').value,{x:.6,y:1.5,w:10,h:.5,fontSize:18});['waste','water_in','water_out','cost','revenue'].forEach((k,i)=>s.addText(names[k]+': '+fmt(sum(current(),k)),{x:.7,y:2.2+i*.7,w:10,h:.5,fontSize:18}));p.writeFile({fileName:'EHS_bao_cao.pptx'})};
initFactoryMap();initCompliance();initCostExplorer();
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
 onAuthStateChanged(auth,async u=>{user=u;role=null;el('login').classList.toggle('hide',!!u);el('logout').classList.toggle('hide',!u);if(!u){el('mode').textContent='Chưa đăng nhập';mountMemberAdmin(db,null,null);mountDataReset(db,null,null,null);unmountOperations();setCostExplorerRecords([]);await mountFactoryMap(db,null,null);await mountCompliance(db,null,null,getAllOperations);data=[];reviewData=[];render();return}try{const membership=await resolveMember(db,u);role=membership?.role||null;mountMemberAdmin(db,u,role);mountDataReset(db,u,role,reload);if(role)mountOperations(db,u,role,reload);else unmountOperations();await mountFactoryMap(db,u,role);await mountCompliance(db,u,role,getAllOperations);el('mode').textContent=u.email+' · '+(role||'chưa cấp quyền');if(role)await reload();else notice('Chưa được cấp quyền; tạo members/'+u.uid+' trong Firestore Console.')}catch(e){notice(e.message)}});
}else{el('mode').textContent='Chưa cấu hình Firebase';el('login').classList.add('hide');render();notice('Chưa kết nối Firebase Web App. Thêm cấu hình từ Project settings để kích hoạt.')}
