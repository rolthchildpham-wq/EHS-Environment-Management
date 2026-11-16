import {getLanguage,t} from './i18n.js?v=20261112f';
import {displaySourceName} from './source-terms.js?v=20261112f';
import {reconcile} from './ehs-financial-reconcile.js?v=20261112f';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const money=x=>Number(x.amount??x.quantity??0);
const period=x=>String(x.date||'').slice(0,7);
const kinds={water:{kind:'water_cost_month',total:'waterCost',title:'A.3 · Chi phí xử lý nước thải',filename:'A3 Nuoc thai'},green:{kind:'green_cost_detail',total:'greenCost',title:'C · Chi phí chăm sóc cây xanh',filename:'C Cay xanh'}};
let records=[],chosen='',lastAutoselect=false;
function preferred(rows){
 const v3=rows.filter(x=>x.spec==='cost-detail-v3'),pool=v3.length?v3:rows;
 const batches=new Map();
 for(const r of pool){const id=r.importId||r.sourceFile||'legacy',stamp=r.createdAt?.seconds||0;
  if(!batches.has(id))batches.set(id,{stamp,rows:[]});
  const b=batches.get(id);b.stamp=Math.max(b.stamp,stamp);b.rows.push(r);}
 return [...batches.values()].sort((a,b)=>b.stamp-a.stamp)[0]?.rows||[];
}
function distinctRows(type,scope){
 const byMonth=new Map();
 for(const r of records.filter(x=>x.kind===kinds[type].kind&&period(x).startsWith(scope))){
  const key=period(r);if(!byMonth.has(key))byMonth.set(key,[]);byMonth.get(key).push(r);
 }
 return [...byMonth.values()].flatMap(preferred);
}
const name=x=>String(x.nameVi||x.name||'').split(/\r?\n/)[0].trim();
const quantity=x=>x.consumedQuantity===null||x.consumedQuantity===undefined?null:Number(x.consumedQuantity);
const group=x=>String(x.costGroup||'Chưa phân nhóm').trim();
function presentRows(type,scope){
 const raw=distinctRows(type,scope);
 if(scope.length===7)return raw.slice().sort((a,b)=>group(a).localeCompare(group(b),'vi')||Number(a.sourceRow||0)-Number(b.sourceRow||0));
 const map=new Map();
 for(const x of raw){
  const key=[group(x),name(x),String(x.consumedUnit||'')].join('|');
  if(!map.has(key))map.set(key,{...x,amount:0,consumedQuantity:0,hasQuantity:false,variedPrice:false});
  const a=map.get(key);a.amount+=money(x);
  if(quantity(x)!==null&&Number.isFinite(quantity(x))){a.consumedQuantity+=quantity(x);a.hasQuantity=true;}
  if(a.price!==x.price)a.variedPrice=true;
 }
 return [...map.values()].map(x=>({...x,consumedQuantity:x.hasQuantity?x.consumedQuantity:null,price:x.variedPrice?null:x.price}))
 .sort((a,b)=>group(a).localeCompare(group(b),'vi')||Number(a.sourceRow||0)-Number(b.sourceRow||0));
}
function choosePeriods(){
 const months=[...new Set(records.filter(x=>Object.values(kinds).some(k=>k.kind===x.kind)).map(period).filter(Boolean))].sort().reverse();
 const years=[...new Set(months.map(x=>x.slice(0,4)))].sort().reverse();
 const sel=$('costDashboardPeriod');if(!sel)return;
 const previous=chosen||sel.value,globalYear=$('from')?.value?.slice(0,4);
 const options=years.flatMap(y=>[{value:y,label:'Cả năm '+y},...months.filter(x=>x.startsWith(y)).map(m=>({value:m,label:'Tháng '+m.slice(5,7)+'/'+y}))]);
 sel.innerHTML=options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('');
 if(options.some(x=>x.value===previous))chosen=previous;
 else{
  const available=months.filter(m=>m.startsWith(globalYear||''));
  const positive=available.filter(m=>Object.keys(kinds).some(k=>distinctRows(k,m).some(x=>money(x)>0)));
  const positiveAll=months.filter(m=>Object.keys(kinds).some(k=>distinctRows(k,m).some(x=>money(x)>0)));
  chosen=positive[0]||positiveAll[0]||available[0]||months[0]||years[0]||'';
 }
 sel.value=chosen;
}
function officialTotal(type,scope){
 const months=reconcile(records,scope.slice(0,4)+'-01-01',scope.slice(0,4)+'-12-31').months.filter(x=>x.month.startsWith(scope));
 const values=months.map(x=>x[kinds[type].total]).filter(x=>x!==null&&x!==undefined);
 return values.length?values.reduce((a,b)=>a+Number(b),0):null;
}
function renderTable(type){
 const rows=presentRows(type,chosen),root=$('costDashboard'+type),meta=$('costDashboardMeta'+type);
 if(!root)return;
 const total=rows.reduce((a,b)=>a+money(b),0),official=officialTotal(type,chosen);
 let html='<table class="ehs-excel-cost"><thead><tr><th>Hạng mục chi phí / 费用项目</th><th>ĐVT</th><th>Đơn giá (VND)</th><th>Tiêu thụ</th><th>Thành tiền (VND)</th></tr></thead><tbody>';
 let groupName=null,subtotal=0;const totals=[];
 const closeGroup=()=>{if(groupName!==null){html+='<tr class="ehs-excel-subtotal"><td colspan="4">Cộng '+esc(groupName)+'</td><td>'+fmt(subtotal)+'</td></tr>';totals.push({group:groupName,total:subtotal});subtotal=0;}};
 for(const x of rows){
  const g=group(x);
  if(g!==groupName){closeGroup();groupName=g;html+='<tr class="ehs-excel-group"><th colspan="5">'+esc(g)+'</th></tr>';}
  subtotal+=money(x);
  html+='<tr><td>'+esc(displaySourceName(x,getLanguage()))+'</td><td>'+esc(x.consumedUnit||'—')+'</td><td class="num">'+fmt(x.price)+'</td><td class="num">'+fmt(quantity(x))+'</td><td class="num">'+fmt(money(x))+'</td></tr>';
 }
 closeGroup();
 if(!rows.length)html+='<tr><td colspan="5" class="ehs-empty-report">Chưa có dữ liệu chi tiết A.3 / C đã nhập cho kỳ này.</td></tr>';
 html+='<tr class="ehs-excel-grand"><td colspan="4">TỔNG CỘNG / 总费用</td><td>'+fmt(rows.length?total:null)+'</td></tr></tbody></table>';
 root.innerHTML=html;
 const reconciled=official!==null&&rows.length&&Math.abs(official-total)<=1;
 meta.textContent=rows.length?(official===null?'Dữ liệu chi tiết: '+rows.length+' hạng mục. Chưa có tổng chính thức để đối chiếu.':reconciled?'Đã khớp với tổng chính thức: '+fmt(official)+' VND':'Tổng gốc '+fmt(official)+' VND · Chênh lệch '+fmt(official-total)+' VND, cần kiểm tra Excel gốc'):'Chưa có dữ liệu của kỳ đã chọn';
 meta.dataset.ok=reconciled?'true':'false';
 return {rows,totals,total};
}
function render(){
 if(!$('costDashboardPeriod'))return;
 for(const type of Object.keys(kinds))renderTable(type);
}
function exportExcel(){
 if(!window.XLSX)return alert('Thư viện xuất Excel chưa tải được.');
 const book=window.XLSX.utils.book_new();
 for(const type of Object.keys(kinds)){
  const rows=presentRows(type,chosen),sum=rows.reduce((a,x)=>a+money(x),0);
  const data=[['Hạng mục chi phí','ĐVT','Đơn giá (VND)','Tiêu thụ','Thành tiền (VND)','Nhóm','Ô nguồn']];
  let g=null,partial=0;
  for(const x of rows){
   if(g!==null&&g!==group(x)){data.push(['Cộng '+g,null,null,null,partial]);partial=0;}
   g=group(x);partial+=money(x);
   data.push([name(x),x.consumedUnit||'',x.price,quantity(x),money(x),g,(x.sourceSheet||'')+'!'+(x.sourceRow||'')]);
  }
  if(g!==null)data.push(['Cộng '+g,null,null,null,partial]);
  data.push(['TỔNG CỘNG',null,null,null,rows.length?sum:null]);
  const sheet=window.XLSX.utils.aoa_to_sheet(data);
  sheet['!cols']=[{wch:44},{wch:12},{wch:18},{wch:16},{wch:23},{wch:26},{wch:26}];
  window.XLSX.utils.book_append_sheet(book,sheet,kinds[type].filename);
 }
 window.XLSX.writeFile(book,'EHS_Bao_cao_A3_C_'+(chosen||'')+'.xlsx');
}
export function initCostExplorer(){
 const mount=$('costExplorerMount');if(!mount)return;
 mount.innerHTML='<div class="ehs-one-dashboard">'+
 '<div class="ehs-dashboard-toolbar"><div><h2>Báo cáo chi phí môi trường</h2><span>A.3 Nước thải & C Cây xanh · Xem trực tiếp như bảng Excel</span></div>'+
 '<div class="ehs-dashboard-actions"><label>Kỳ báo cáo <select id="costDashboardPeriod" aria-label="Kỳ báo cáo A.3 và C"></select></label>'+
 '<button id="costDashboardExport" class="primary" type="button">Xuất Excel</button></div></div>'+
 '<div class="ehs-cost-dual">'+Object.keys(kinds).map(type=>'<section class="ehs-cost-panel"><div class="ehs-cost-heading"><h3>'+esc(kinds[type].title)+'</h3><span id="costDashboardMeta'+type+'" class="muted"></span></div><div class="ehs-cost-tablewrap" id="costDashboard'+type+'"></div></section>').join('')+'</div></div>';
 $('costDashboardPeriod').onchange=()=>{chosen=$('costDashboardPeriod').value;render()};
 $('costDashboardExport').onclick=exportExcel;
 document.addEventListener('ehs-language-change',render);
 choosePeriods();render();
}
export function setCostExplorerRecords(rows){
 records=Array.isArray(rows)?rows.slice():[];
 if(!$('costExplorerMount'))return;
 choosePeriods();render();
}