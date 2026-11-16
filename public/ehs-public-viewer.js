import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const money=arr=>arr.reduce((sum,x)=>sum+Number(x.amount||0),0);
const sum=(rows,key)=>rows.reduce((n,x)=>n+Number(x[key]||0),0);
let db=null,data=null;
function table(type,rows){
 const root=$(type);if(!root)return;
 const months=$('month').value;
 const filtered=(rows||[]).filter(x=>months==='all'||x.month.endsWith('-'+months))
  .sort((a,b)=>String(a.group||'').localeCompare(String(b.group||''),'vi')||String(a.name||'').localeCompare(String(b.name||''),'vi'));
 let body='',group='',sub=0;
 const subtotal=()=>{if(!group)return;body+='<tr class="sub"><td colspan="4">Cộng '+esc(group)+'</td><td>'+fmt(sub)+'</td></tr>';sub=0};
 for(const r of filtered){
  if(r.group!==group){subtotal();group=r.group;body+='<tr class="group"><th colspan="5">'+esc(group||'Chưa phân nhóm')+'</th></tr>'}
  sub+=Number(r.amount||0);
  body+='<tr><td>'+esc(r.name)+'</td><td>'+esc(r.unit||'—')+'</td><td>'+fmt(r.price)+'</td><td>'+fmt(r.quantity)+'</td><td>'+fmt(r.amount)+'</td></tr>';
 }
 subtotal();
 if(!filtered.length)body='<tr><td colspan="5">Không có dữ liệu trong kỳ đã chọn.</td></tr>';
 root.innerHTML='<table><thead><tr><th>Hạng mục</th><th>ĐVT</th><th>Đơn giá</th><th>Tiêu thụ</th><th>Thành tiền (VND)</th></tr></thead><tbody>'+body+'<tr class="total"><td colspan="4">TỔNG CỘNG</td><td>'+fmt(filtered.length?money(filtered):null)+'</td></tr></tbody></table>';
}
function render(){
 if(!data)return;
 const month=$('month').value,rows=data.monthly.filter(x=>month==='all'||x.month.endsWith('-'+month));
 $('mWaste').textContent=fmt(rows.length?sum(rows,'wasteKg'):null)+' kg';
 $('mWater').textContent=fmt(rows.length?sum(rows,'waterOut'):null)+' m³';
 $('mWaterCost').textContent=fmt(rows.length?sum(rows,'waterCost'):null)+' VND';
 $('mGreenCost').textContent=fmt(rows.length?sum(rows,'greenCost'):null)+' VND';
 table('water',data.water);table('green',data.green);
 $('status').textContent='Đang xem '+rows.length+' tháng đã công bố. Dữ liệu chỉ đọc; không chứa thông tin nhân sự hoặc chứng từ gốc.';
}
async function loadYear(){
 const year=$('year').value;
 $('status').textContent='Đang tải báo cáo '+year+'...';
 try{
  const snap=await getDoc(doc(db,'public_reports',year));
  if(!snap.exists()||snap.data().published!==true)throw Error('Năm này chưa được quản trị viên công bố.');
  data=snap.data();
  const months=[...new Set([...(data.monthly||[]).map(x=>x.month.slice(5,7)),...(data.water||[]).map(x=>x.month.slice(5,7)),...(data.green||[]).map(x=>x.month.slice(5,7))])].sort();
  const previous=$('month').value;
  $('month').innerHTML='<option value="all">Cả năm</option>'+months.map(m=>'<option value="'+esc(m)+'">Tháng '+esc(m)+'</option>').join('');
  $('month').value=months.includes(previous)?previous:'all';
  $('updated').textContent='Chỉ hiển thị dữ liệu đã công bố';
  render();
 }catch(e){data=null;$('water').textContent='';$('green').textContent='';$('status').textContent='Không tải được báo cáo: '+e.message;}
}
async function init(){
 if(!window.EHS_FIREBASE_CONFIG){$('status').textContent='Thiếu cấu hình Firebase.';return}
 db=getFirestore(initializeApp(window.EHS_FIREBASE_CONFIG));
 let years=[];
 try{const cat=await getDoc(doc(db,'public_reports','catalog'));years=cat.exists()?cat.data().years||[]:[]}catch(e){$('status').textContent='Không thể tải danh mục báo cáo: '+e.message;return}
 if(!years.length){$('status').textContent='Chưa có kỳ nào được quản trị viên công bố. Vui lòng liên hệ quản trị viên.';return}
 const requested=new URLSearchParams(location.search).get('year');
 $('year').innerHTML=years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
 $('year').value=years.includes(requested)?requested:years[0];
 $('year').onchange=loadYear;$('month').onchange=render;
 await loadYear();
}
init();