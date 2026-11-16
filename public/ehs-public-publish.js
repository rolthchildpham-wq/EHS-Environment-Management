import {doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {reconcile} from './ehs-financial-reconcile.js?v=20261112f';
const $=id=>document.getElementById(id);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const period=x=>String(x.date||'').slice(0,7);
function latestByMonth(rows) {
 const buckets=new Map();
 for(const r of rows){const key=period(r);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r)}
 return [...buckets.values()].flatMap(list=>{
  const candidates=list.some(r=>r.spec==='cost-detail-v3')?list.filter(r=>r.spec==='cost-detail-v3'):list;
  const batches=new Map();
  for(const x of candidates){const key=x.importId||x.sourceFile||'legacy';
   if(!batches.has(key))batches.set(key,{time:x.updatedAt?.seconds||x.createdAt?.seconds||0,rows:[]});
   batches.get(key).rows.push(x);
   batches.get(key).time=Math.max(batches.get(key).time,x.updatedAt?.seconds||x.createdAt?.seconds||0);
  }
  return [...batches.values()].sort((a,b)=>b.time-a.time)[0]?.rows||[];
 });
}
export async function publishPublicReport(db,rows,year,actor){
 if(!/^\d{4}$/.test(String(year)))throw Error('Năm không hợp lệ');
 if(!actor)throw Error('Chỉ quản trị viên được công bố báo cáo');
 const source=Array.isArray(rows)?rows:[];
 const financial=reconcile(source,year+'-01-01',year+'-12-31');
 const monthly=financial.months.map(m=>({
  month:m.month,wasteKg:num(m.wasteKg),waterIn:num(m.waterIn),waterOut:num(m.waterOut),
  waterCost:m.waterCost,greenCost:m.greenCost,wasteCost:m.wasteCost,
  industrialKg:m.industrialKg,hazardousKg:m.hazardousKg,
  stockIn:num(m.stockIn),stockOut:num(m.stockOut),revenue:m.revenue
 }));
 const lines={water:[],green:[]};
 for(const [type,kind] of [['water','water_cost_month'],['green','green_cost_detail']]){
  lines[type]=latestByMonth(source.filter(r=>r.kind===kind&&period(r).startsWith(year))).map(x=>({
    month:period(x),group:String(x.costGroup||'Chưa phân nhóm').slice(0,90),
    name:String(x.nameVi||x.name||'').split(/\r?\n/)[0].slice(0,180),
    unit:String(x.consumedUnit||'').slice(0,32),
    quantity:x.consumedQuantity==null?null:num(x.consumedQuantity),
    price:x.price==null?null:num(x.price),amount:num(x.amount??x.quantity)
  }));
 }
 if(!monthly.length&&!lines.water.length&&!lines.green.length)throw Error('Chưa có dữ liệu thực để công bố năm '+year);
 if(lines.water.length+lines.green.length>1200)throw Error('Dữ liệu chi tiết quá lớn để công bố trong một tài liệu');
 const payload={published:true,year:String(year),monthly,water:lines.water,green:lines.green,updatedAt:serverTimestamp()};
 await setDoc(doc(db,'public_reports',String(year)),payload);
 const cat=doc(db,'public_reports','catalog');
 const old=await getDoc(cat);
 const years=[...new Set([...(old.exists()?old.data().years||[]:[]),String(year)])].filter(y=>/^\d{4}$/.test(y)).sort().reverse();
 await setDoc(cat,{published:true,years,updatedAt:serverTimestamp()});
 return {months:monthly.length,items:lines.water.length+lines.green.length};
}
export function mountPublicPublisher(db,actor,role,getRows){
 const target=$('publicPublisherMount');if(!target)return;
 if(role!=='admin'){target.innerHTML='';return}
 const year=String(new Date().getFullYear());
 target.innerHTML='<div class="panel"><h3>Viewer công khai · Dashboard & báo cáo</h3>'+
 '<p class="muted">Chỉ công bố dữ liệu EHS đã tổng hợp: tháng, khối lượng, chi phí và danh mục chi phí. Không công bố thông tin tài khoản, phiếu nhập gốc, nhân viên hoặc hồ sơ quản trị. Dữ liệu chỉ xuất hiện sau khi quản trị viên xác nhận công bố.</p>'+
 '<div class="controls"><label>Năm công bố<input id="publicPublishYear" type="number" min="2020" max="2100" value="'+year+'"></label>'+
 '<button id="publicPublishNow" class="primary">Kiểm tra và công bố năm</button>'+
 '<a href="viewer.html" target="_blank" rel="noopener noreferrer">Mở Viewer công khai</a></div><p id="publicPublishStatus" class="muted"></p></div>';
 $('publicPublishNow').onclick=async()=>{
  const y=String($('publicPublishYear').value),b=$('publicPublishNow');
  if(!confirm('Công bố dữ liệu Dashboard và chi phí '+y+' cho BẤT KỲ người có link? Dữ liệu đã công bố sẽ được xem không cần đăng nhập.'))return;
  b.disabled=true;
  try{const result=await publishPublicReport(db,getRows(),y,actor);
    $('publicPublishStatus').textContent='Đã công bố '+result.months+' tháng, '+result.items+' dòng chi phí. Link: '+location.origin+'/viewer.html';
  }catch(e){$('publicPublishStatus').textContent='Chưa công bố: '+e.message}
  finally{b.disabled=false}
 };
}