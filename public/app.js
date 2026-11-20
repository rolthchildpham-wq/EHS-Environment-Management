import {loadEhsPermissions,may,applyRights} from './ehs-permissions.js?v=20261119weigh1';
import {mountQrStock,unmountQrStock} from './ehs-qr-stock.js?v=20261116fixnull';
import {initSimpleFinance,setSimpleFinanceRecords} from './ehs-simple-finance.js?v=20261116fa';
import {mountPublicPublisher} from './ehs-public-publish.js?v=20261116a';
import {initCostExplorer,setCostExplorerRecords,configureCostExplorer,getCostReportRows,setCostExplorerView,setCostExplorerPeriod} from './ehs-cost-detail.js?v=20261116drill2';
import {initFactoryMap,mountFactoryMap} from './factory-map.js?v=20261112f';
import {initCompliance,mountCompliance,refreshCompliance} from './ehs-compliance.js?v=20261112f';
import {installI18n,t} from './i18n.js?v=20261112f';
import {mountDataReset} from './data-reset.js?v=20261112f';
import {mountOperations,unmountOperations,loadOperations,getOperationalRecords,getAllOperations,renderOperationsReport} from './ehs-operations.js?v=20261116stockqr2';
import {resolveMember,mountMemberAdmin} from './member-admin.js?v=20261112f';
import {installAppCheck} from './app-check.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,addDoc,getDocs,query,limit,serverTimestamp,updateDoc} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const el=id=>document.getElementById(id);
const fmt=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={waste:'Rác thải',water_in:'Nước vào',water_out:'Nước ra',stock_in:'Nhập vật tư',stock_out:'Xuất vật tư',cost:'Chi phí',revenue:'Doanh thu'};
const labels={dashboard:'Tổng quan',records:'Nhật ký',map:'Bản đồ',import:'Nhập liệu & Excel',reports:'Báo cáo',admin:'Quản trị',compliance:'Chỉ số EHS & ISO'};
let data=[],pending=[],reviewData=[],user=null,role=null,db=null,auth=null,charts={};
let authPending=true,authRevision=0;
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
 const categoryPalette=['#2188CC','#E85B79','#F59E42','#F6C44A','#25B7B0','#8B61E8','#70879D','#4E9C50','#D173B6','#D57532','#6479D6','#AA7B3B'];
 const polished=sets.map((set,i)=>{
  const color=['#108e83','#2999bd','#eaa34f','#896dd5'][i%4];
  return {...set,
   // Each waste category gets a distinct slice color and matching legend marker.
   backgroundColor:isDoughnut
    ? (Array.isArray(set.backgroundColor)?set.backgroundColor:labels.map((_,j)=>categoryPalette[j%categoryPalette.length]))
    : (set.backgroundColor||(type==='line'?'transparent':color)),
   borderWidth:isDoughnut?2:type==='line'?2.5:0,
   borderRadius:type==='bar'?5:0,
   maxBarThickness:37,
   borderColor:isDoughnut?'#ffffff':(set.borderColor||color),
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

function journalRows(){
 const year=el('recordYear')?.value||'all',month=el('recordMonth')?.value||'all';
 return [...data,...reviewData].filter(x=>(year==='all'||x.date.slice(0,4)===year)&&(month==='all'||x.date.slice(5,7)===month));
}
function refreshJournalPeriods(){
 const yearSelect=el('recordYear'),monthSelect=el('recordMonth');
 if(!yearSelect||!monthSelect)return;
 const all=[...data,...reviewData],oldYear=yearSelect.value||'all',oldMonth=monthSelect.value||'all';
 const years=[...new Set(all.map(x=>x.date.slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
 yearSelect.innerHTML='<option value="all">Tất cả các năm</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 yearSelect.value=years.includes(oldYear)?oldYear:'all';
 const months=[...new Set(all.filter(x=>yearSelect.value==='all'||x.date.startsWith(yearSelect.value)).map(x=>x.date.slice(5,7)))].sort();
 monthSelect.innerHTML='<option value="all">Tất cả các tháng</option>'+months.map(m=>'<option value="'+m+'">Tháng '+m+'</option>').join('');
 monthSelect.value=months.includes(oldMonth)?oldMonth:'all';
}
function selectedRecords(){
 const kind=el('kind')?.value||'all',item=el('recordItem')?.value||'all',unit=el('recordUnit')?.value||'all';
 return journalRows().filter(x=>(kind==='all'||x.kind===kind)&&(item==='all'||String(x.name||'')===item)&&(unit==='all'||String(x.unit||'')===unit));
}
function refreshRecordChoices(){
 const kind=el('kind')?.value||'all',base=journalRows().filter(x=>kind==='all'||x.kind===kind);
 for(const [id,key] of [['recordItem','name'],['recordUnit','unit']]){
  const sel=el(id);if(!sel)continue;const old=sel.value;
  const vals=[...new Set(base.map(x=>String(x[key]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
  sel.innerHTML='<option value="all">Tất cả</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  sel.value=vals.includes(old)?old:'all';
 }
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
 refreshRecordChoices();
 refreshJournalPeriods();
 const filtered=selectedRecords().sort((a,b)=>b.date.localeCompare(a.date));
 el('recordRows').innerHTML=filtered.slice(0,1500).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.date.slice(5,7))+'</td><td>'+esc(x.date.slice(0,4))+'</td><td>'+esc(names[x.kind])+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.value)+'</td><td>'+esc(x.unit)+'</td><td>'+esc(x.source)+'</td></tr>').join('');
 if(el('recordCount'))el('recordCount').textContent='Hiển thị '+Math.min(filtered.length,1500)+'/'+filtered.length+' dòng';
 const totals=new Map();
 for(const x of filtered){const unit=String(x.unit||'').trim()||'không có ĐVT';totals.set(unit,(totals.get(unit)||0)+Number(x.value||0))}
 if(el('recordTotals'))el('recordTotals').textContent=filtered.length?'TỔNG THEO ĐƠN VỊ: '+[...totals].map(([u,v])=>fmt(v)+' '+u).join(' · '):'Không có dữ liệu theo bộ lọc.';

 const cost=sum(r,'cost'),revenue=sum(r,'revenue');
 const wc=r.filter(x=>x.kind==='cost'&&x.name==='water_cost').reduce((s,x)=>s+x.value,0);
 const water=sum(r,'water_out');
 el('financeStats').innerHTML=stat('Chi phí',cost,'VND',sum(p,'cost'))+stat('Doanh thu',revenue,'VND',sum(p,'revenue'))+stat('Chênh lệch',revenue-cost,'VND',sum(p,'revenue')-sum(p,'cost'))+stat('Chi phí nước / m³',water&&wc?wc/water:0,water&&wc?'VND/m³':'thiếu dữ liệu',0);
 el('financeRows').innerHTML=months.map((m,i)=>'<tr><td>'+m+'</td><td>'+fmt(monthly(r,'cost')[i])+'</td><td>'+fmt(monthly(r,'revenue')[i])+'</td><td>'+fmt(monthly(r,'revenue')[i]-monthly(r,'cost')[i])+'</td></tr>').join('');
 el('reportBody').innerHTML='<h3>Kỳ: '+esc(el('from').value)+' – '+esc(el('to').value)+'</h3><table><thead><tr><th>Chỉ tiêu</th><th>Kỳ này</th><th>Kỳ so sánh</th><th>Thay đổi</th></tr></thead><tbody>'+Object.keys(names).map(k=>{const a=sum(r,k),b=sum(p,k);return '<tr><td>'+esc(names[k])+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td><td>'+(b?fmt((a-b)/b*100)+'%':'Thiếu dữ liệu')+'</td></tr>'}).join('')+'</tbody></table><p class="muted">Không cộng các vật tư khác đơn vị để tính tồn kho.</p>';
}
function preview(){el('preview').innerHTML=pending.slice(0,500).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(names[x.kind])+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.value)+'</td><td>'+esc(x.unit)+'</td><td>'+esc(x.note)+'</td></tr>').join('')}
function rows(){return selectedRecords().map(x=>({'Ngày':x.date,'Loại':names[x.kind],'Tên':x.name,'Số lượng':x.value,'Đơn vị':x.unit,'Ghi chú':x.note,'Nguồn':x.source}))}
function xlsxExport(filename){if(!window.XLSX)return alert('Không tải được XLSX');const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows()),'Du lieu');XLSX.writeFile(book,filename)}
function parseSheet(rows,sheetName='Sheet1'){
 const dict={'rac':'waste','rac thai':'waste','nuoc vao':'water_in','nuoc ra':'water_out','nhap vat tu':'stock_in','xuat vat tu':'stock_out','chi phi':'cost','doanh thu':'revenue'};
 const normalizeKey=k=>String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
 const result=[],errors=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i],line=i+2;
  if(Object.values(row).every(v=>v===null||v===undefined||String(v).trim()===''))continue;
  const obj=Object.fromEntries(Object.entries(row).map(([k,v])=>[normalizeKey(k),v]));
  let d=obj.ngay??obj.date;
  if(typeof d==='number'){const z=XLSX.SSF.parse_date_code(d);d=z?z.y+'-'+String(z.m).padStart(2,'0')+'-'+String(z.d).padStart(2,'0'):''}
  if(d instanceof Date)d=Number.isNaN(d.getTime())?'':d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const match=String(d??'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed=match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3])):null;
  if(!parsed||parsed.getFullYear()!==Number(match[1])||parsed.getMonth()+1!==Number(match[2])||parsed.getDate()!==Number(match[3])){errors.push(sheetName+': cột Ngày dòng '+line+' không đúng định dạng YYYY-MM-DD');continue}
  let k=normalizeKey(obj.loai??obj.kind??'');k=dict[k]||k;
  const value=obj['so luong']??obj['so_luong']??obj.value;
  if(value===null||value===undefined||String(value).trim()===''||!Number.isFinite(Number(value))){errors.push(sheetName+': cột Số lượng dòng '+line+' phải là số hợp lệ');continue}
  const record=norm({date:d,kind:k,value,unit:obj['don vi']??obj['don_vi'],name:obj.ten??obj.name,note:obj['ghi chu'],source:'excel'});
  if(!valid(record)){errors.push(sheetName+': dòng '+line+' có Loại, Tên hoặc Đơn vị không hợp lệ');continue}
  result.push(record);
 }
 if(errors.length)throw Error('File Excel có '+errors.length+' dòng lỗi. '+errors.slice(0,8).join(' | ')+(errors.length>8?' | ...':''));
 return result;
}
async function reload(){
 if(!db||!role)return;
 const snap=await getDocs(query(collection(db,'records'),limit(5000)));
 data=snap.docs.map(d=>norm(d.data())).filter(valid);
 await loadOperations();await loadApprovedWasteWeighing();setCostExplorerRecords(getAllOperations());setSimpleFinanceRecords(getAllOperations());if(role&&['admin','editor'].includes(role)){try{mountQrStock(db,user,role,getAllOperations,reload)}catch(error){console.error('QR refresh failed',error)}}data.push(...getOperationalRecords());
 await reviews();updateYearOptions();render();refreshCompliance();notice('Đã tải '+data.length+' bản ghi dữ liệu gốc/nghiệp vụ và '+reviewData.length+' chứng từ đã duyệt. Bảng báo cáo nghiệp vụ hiển thị chi tiết theo sheet Excel.');
}
// Approved QR weigh batches are derived journal records, never duplicate editable import rows.
async function loadApprovedWasteWeighing(){
 const snap=await getDocs(query(collection(db,'waste_weigh_batches'),limit(5000)));
 const approved=snap.docs.map(x=>x.data()).filter(x=>x.status==='approved');
 data.push(...approved.map(x=>norm({
  date:x.date,kind:'waste',value:x.net,unit:'kg',name:x.name,
  note:'QR cân rác • '+x.group+' • '+x.count+' lượt • cân '+x.gross+' kg • bao bì '+x.tare+' kg',
  source:'qr-weigh-approved'
 })).filter(valid));
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
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
 if(!may(({dashboard:'dashboard',records:'journal',map:'map',import:'excel_import',reports:'reports',admin:'users_manage',compliance:'compliance'})[b.dataset.tab]))return;
 document.querySelectorAll('main > section').forEach(s=>s.classList.toggle('active',s.id===b.dataset.tab));
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));
});
const environmentMode=document.documentElement.classList.contains('ehs-environment-mode');
if(environmentMode){
 el('portal').classList.remove('active');
 el('dashboard').classList.add('active');
}else{
 el('dashboard').classList.remove('active');
 el('portal').classList.add('active');
}
el('hubLogin').onclick=()=>el('login').click();
el('hubLogout').onclick=()=>el('logout').click();
document.querySelectorAll('[data-hub]').forEach(link=>link.addEventListener('click',event=>{
 const target=link.dataset.hub;
 const allowed=!!user&&!!role&&may('hub_view')&&
   (target==='wwtp'?may('wwtp_view'):
    ['dashboard','journal','reports','map','compliance'].some(key=>may(key)));
 if(allowed)return;
 event.preventDefault();
 const status=el('hubNotice');
 status.textContent=!user?'Hãy đăng nhập Google để mở hệ thống.':
    'Tài khoản EHS chưa được cấp quyền vào phân hệ này. Liên hệ Admin để cấp quyền.';
 if(!user)el('hubLogin').focus();
}));
function syncEhsHub(){
 const authenticated=!!user,can=authenticated&&!authPending&&!!role&&may('hub_view');
 el('hubLogin').hidden=authenticated||authPending;
 el('hubLogout').hidden=!authenticated;
 el('hubIdentity').textContent=authPending?'Đang xác minh phiên EHS…':authenticated?(esc(user.email||'Tài khoản EHS')+(role?' · '+role.toUpperCase():' · chưa được cấp quyền')):'Chưa đăng nhập EHS';
 el('hubNotice').textContent=authPending?'Đang xác minh phiên đăng nhập và phân quyền EHS…':can?'Bạn đã đăng nhập EHS. Chọn một trong hai hệ thống bên dưới để mở riêng toàn màn hình.':
  authenticated?'Tài khoản chưa có quyền Hub. Liên hệ Admin để được cấp quyền.':
  'Đăng nhập Google bằng tài khoản EHS đã được cấp quyền để truy cập các phân hệ.';
}
const requestedTab=new URLSearchParams(location.search).get('tab');
if(requestedTab&&Object.hasOwn(labels,requestedTab)){
 const target=[...document.querySelectorAll('[data-tab]')].find(b=>b.dataset.tab===requestedTab);
 if(target)target.click();
}
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
el('refresh').onclick=async()=>{await reload();};el('recordYear').onchange=()=>{el('recordMonth').value='all';render()};el('recordMonth').onchange=render;el('kind').onchange=render;el('recordItem').onchange=render;el('recordUnit').onchange=render;el('exportExcel').onclick=()=>{if(!may('report_export'))return alert('Không có quyền xuất báo cáo.');xlsxExport('EHS_du_lieu.xlsx')};el('reportExcel').onclick=()=>{if(!may('report_export'))return alert('Không có quyền xuất báo cáo.');xlsxExport('EHS_bao_cao.xlsx')};
el('printReport').onclick=()=>{const w=window.open('','_blank');if(!w)return alert('Bật popup để in');w.document.write('<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:30px;font-size:12px}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}td,th{border:1px solid #ddd;padding:6px}button,.controls{display:none}</style></head><body><h1>BÁO CÁO EHS</h1>'+el('reportBody').innerHTML+el('opsReport').innerHTML+'</body></html>');w.document.close();w.print()};
el('reportPpt').onclick=()=>{if(!window.pptxgen)return alert('Không tải được PowerPoint');const p=new window.pptxgen();p.layout='LAYOUT_WIDE';const s=p.addSlide();s.addText('BÁO CÁO MÔI TRƯỜNG EHS',{x:.6,y:.6,w:11,h:.7,fontSize:27,bold:true});s.addText(el('from').value+' – '+el('to').value,{x:.6,y:1.5,w:10,h:.5,fontSize:18});['waste','water_in','water_out','cost','revenue'].forEach((k,i)=>s.addText(names[k]+': '+fmt(sum(current(),k)),{x:.7,y:2.2+i*.7,w:10,h:.5,fontSize:18}));p.writeFile({fileName:'EHS_bao_cao.pptx'})};
initFactoryMap();initCompliance();initCostExplorer();initSimpleFinance();
const syncReportMode=()=>{
 const mode=el('reportViewMode')?.value||'overview';
 const specific=mode==='water'||mode==='green';
 const summary=el('simpleFinanceMount'),details=el('costExplorerMount'),searchLabel=el('reportItemSearchLabel');
 if(!summary||!details||!searchLabel)return;
 summary.hidden=specific;details.hidden=!specific;searchLabel.hidden=!specific;
 if(specific){
  setCostExplorerView(mode,el('reportItemSearch')?.value||'');
  const year=el('simpleFinanceYear')?.value||el('dashboardYear')?.value||'';
  const month=el('simpleFinanceMonth')?.value||'all';
  setCostExplorerPeriod(month==='all'?year:year+'-'+month);
 }
};
el('reportViewMode').onchange=()=>{el('reportItemSearch').value='';syncReportMode()};
el('reportItemSearch').oninput=syncReportMode;
for(const id of ['simpleFinanceYear','simpleFinanceMonth']){
 el(id).addEventListener('change',syncReportMode);
}
syncReportMode();
el('parseExcel').onclick=async()=>{const f=el('excelFile').files[0];if(!f)return alert('Chọn file Excel');try{if(!window.XLSX)throw Error('Không tải được XLSX');const book=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});pending=book.SheetNames.flatMap(n=>parseSheet(XLSX.utils.sheet_to_json(book.Sheets[n],{defval:null}),n));preview();el('importStatus').textContent='Đọc được '+pending.length+' dòng hợp lệ. Chỉ hỗ trợ định dạng cột chuẩn.'}catch(e){el('importStatus').textContent=e.message}};
el('saveImport').onclick=async()=>{if(!pending.length)return alert('Chưa có dữ liệu');if(!db||!user||!may('excel_import'))return alert('Chưa được cấp quyền nhập Excel.');if(!confirm('Lưu '+pending.length+' dòng?'))return;try{for(const x of pending)await addDoc(collection(db,'records'),{...x,createdBy:user.uid,createdAt:serverTimestamp()});pending=[];preview();await reload()}catch(e){alert(e.message)}};
el('aiRead').disabled=true;
el('aiRead').textContent='AI cần backend riêng';
el('aiStatus').textContent='Spark: chưa hỗ trợ AI tự động. Vui lòng nhập thủ công số liệu từ ảnh để quản trị viên kiểm duyệt.';
el('submitEvidence').onclick=async()=>{
 if(!user||!may('manual_entry'))return alert('Không có quyền nhập thủ công.');
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

el('login').onclick=async()=>{
 if(!auth)return;
 try{
  await setPersistence(auth,browserLocalPersistence);
  await signInWithPopup(auth,new GoogleAuthProvider());
 }catch(e){
  console.error('EHS Google sign-in failed',e);
  el('hubNotice').textContent='Không thể duy trì phiên đăng nhập: '+e.message;
  notice('Đăng nhập thất bại: '+e.message);
 }
};
el('logout').onclick=()=>auth&&signOut(auth);
if(window.EHS_FIREBASE_CONFIG){
 const app=initializeApp(window.EHS_FIREBASE_CONFIG);installAppCheck(app);
 auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async u=>{const revision=++authRevision;user=u;role=null;authPending=!!u;syncEhsHub();el('login').classList.toggle('hide',!!u);el('logout').classList.toggle('hide',!u);if(!u){authPending=false;syncEhsHub();await loadEhsPermissions(null,null,null);el('mode').textContent='Chưa đăng nhập';unmountQrStock();mountMemberAdmin(db,null,null);mountPublicPublisher(db,null,null,()=>[]);mountDataReset(db,null,null,null);unmountOperations();setCostExplorerRecords([]);await configureCostExplorer(null,null);await mountFactoryMap(db,null,null);await mountCompliance(db,null,null,getAllOperations);data=[];reviewData=[];render();return}try{const membership=await resolveMember(db,u);if(revision!==authRevision)return;role=membership?.role||null;await loadEhsPermissions(db,u,role);if(revision!==authRevision)return;authPending=false;syncEhsHub();mountMemberAdmin(db,u,role);mountPublicPublisher(db,u,role,()=>({operations:getAllOperations(),costs:getCostReportRows(String(el('publicPublishYear')?.value||new Date().getFullYear()))}));mountDataReset(db,u,role,reload);if(role){mountOperations(db,u,role,reload);try{mountQrStock(db,u,role,getAllOperations,reload)}catch(error){console.error('QR initialization failed',error)}}else{unmountOperations();unmountQrStock();}await mountFactoryMap(db,u,role);await mountCompliance(db,u,role,getAllOperations);el('mode').textContent=u.email+' · '+(role||'chưa cấp quyền');if(role){await reload();await configureCostExplorer(db,role);applyRights();}else notice('Chưa được cấp quyền; tạo members/'+u.uid+' trong Firestore Console.')}catch(e){if(revision!==authRevision)return;authPending=false;syncEhsHub();el('hubNotice').textContent='Không xác minh được quyền EHS: '+e.message;notice(e.message)}});
}else{el('mode').textContent='Chưa cấu hình Firebase';el('login').classList.add('hide');render();notice('Chưa kết nối Firebase Web App. Thêm cấu hình từ Project settings để kích hoạt.')}
