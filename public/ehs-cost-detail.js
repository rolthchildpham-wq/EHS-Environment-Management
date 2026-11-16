import {getLanguage,t} from './i18n.js?v=20261112f';
import {displaySourceName} from './source-terms.js?v=20261112f';
import {reconcile} from './ehs-financial-reconcile.js?v=20261112f';
import {doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const money=x=>Number(x.amount??x.quantity??0);
const period=x=>String(x.date||'').slice(0,7);
const kinds={water:{kind:'water_cost_month',total:'waterCost',title:'A.3 · Chi phí xử lý nước thải',filename:'A3 Nuoc thai'},green:{kind:'green_cost_detail',total:'greenCost',title:'C · Chi phí chăm sóc cây xanh',filename:'C Cay xanh'}};
let records=[],chosen='',mappingDb=null,mappingRole=null,mappings=[];
function preferred(rows){
 const v3=rows.filter(x=>x.spec==='cost-detail-v3'),pool=v3.length?v3:rows;
 const unique=new Map();
 for(const x of pool){
  const key=[x.kind,x.date,x.sourceFile,x.sourceSheet,x.sourceRow,x.name].join('|');
  const stamp=x.updatedAt?.seconds||x.createdAt?.seconds||0;
  const old=unique.get(key);
  if(!old||stamp>=(old.updatedAt?.seconds||old.createdAt?.seconds||0))unique.set(key,x);
 }
 return [...unique.values()];
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
function mappedRows(type,scope){
 const rows=distinctRows(type,scope).map(x=>({...x}));
 for(const x of rows){
  if(Number(x.amount??x.quantity??0)>0)continue; // Excel/manual line with amount wins.
  const config=mappings.find(m=>m.type===type&&m.item===name(x));if(!config)continue;
  const outs=records.filter(r=>r.kind==='stock_out'&&String(r.code||r.name||'')===config.code&&period(r)===period(x));
  if(!outs.length)continue;
  const unit=String(config.unit||'').trim();
  if(unit&&x.consumedUnit&&unit!==String(x.consumedUnit).trim())continue;
  const used=outs.reduce((a,r)=>a+Number(r.quantity||0),0);
  const inputs=records.filter(r=>r.kind==='stock_in'&&String(r.code||r.name||'')===config.code&&r.date<=period(x)+'-31')
   .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const price=Number(x.price)>0?Number(x.price):Number(inputs.find(r=>Number(r.price)>0)?.price||0);
  x.consumedQuantity=used;x.consumedUnit=unit||x.consumedUnit;
  x.price=price||null;x.amount=price>0?used*price:0;x.autoFromStock=true;
 }
 return rows;
}
export function getCostReportRows(year){
 const out={water:[],green:[]};
 for(const type of Object.keys(out)){
  for(let m=1;m<=12;m++)out[type].push(...mappedRows(type,year+'-'+String(m).padStart(2,'0')));
 }
 return out;
}
export async function configureCostExplorer(db,role){
 mappingDb=db;mappingRole=role;mappings=[];
 if(db&&role){
  try{const snap=await getDoc(doc(db,'settings','costMappings'));if(snap.exists())mappings=Array.isArray(snap.data().items)?snap.data().items:[]}
  catch(e){const status=$('costMapStatus');if(status)status.textContent='Không tải được liên kết: '+e.message}
 }
 renderMapping();render();
}
function renderMapping(){
 const root=$('costMappingMount');if(!root)return;
 root.hidden=mappingRole!=='admin';
 if(mappingRole!=='admin')return;
 const entries=Object.entries(kinds).flatMap(([type,k])=>distinctRows(type,chosen).map(x=>({type,name:name(x)})));
 const unique=[...new Map(entries.map(x=>[[x.type,x.name].join('|'),x])).values()];
 const inventory=[...new Map(records.filter(x=>['stock_out','stock_in'].includes(x.kind)).map(x=>[String(x.code||x.name||''),x])).values()].filter(x=>x.code||x.name);
 const sel1=$('costMapItem'),sel2=$('costMapStock');if(!sel1||!sel2)return;
 sel1.innerHTML=unique.map(x=>'<option value="'+esc(x.type+'|'+x.name)+'">'+esc((x.type==='water'?'A.3':'C')+' · '+x.name)+'</option>').join('');
 sel2.innerHTML=inventory.map(x=>'<option value="'+esc(String(x.code||x.name))+'">'+esc(String(x.code||x.name)+' · '+x.name+' ('+x.unit+')')+'</option>').join('');
 $('costMapList').textContent=mappings.length?'Đang liên kết '+mappings.length+' hạng mục: '+mappings.map(x=>x.item+' ← '+x.code).join('; '):'Chưa liên kết vật tư. Chỉ các hạng mục được xác nhận mới tự lấy số lượng xuất kho.';
}
async function saveMapping(){
 if(mappingRole!=='admin'||!mappingDb)return;
 const [type,...rest]=String($('costMapItem').value).split('|');
 const item=rest.join('|'),code=$('costMapStock').value;
 const stock=records.find(x=>['stock_in','stock_out'].includes(x.kind)&&String(x.code||x.name)===code);
 if(!type||!item||!stock)return;
 const entry={type,item,code,unit:String(stock.unit||'')};
 const next=mappings.filter(x=>!(x.type===type&&x.item===item)).concat([entry]);
 try{
  await setDoc(doc(mappingDb,'settings','costMappings'),{items:next,updatedAt:serverTimestamp()});
  mappings=next;renderMapping();render();$('costMapStatus').textContent='Đã lưu liên kết. Chỉ dùng phiếu xuất cùng tháng; dòng chi phí Excel có số tiền sẽ được ưu tiên.';
 }catch(e){$('costMapStatus').textContent='Không lưu được: '+e.message}
}
function presentRows(type,scope){
 const raw=mappedRows(type,scope);
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
 '<details id="costMappingMount" class="ehs-cost-mapping" hidden><summary>Liên kết hạng mục với phiếu xuất vật tư (Admin)</summary><div class="controls"><label>Hạng mục chi phí<select id="costMapItem"></select></label><label>Mã vật tư<select id="costMapStock"></select></label><button id="costMapSave" type="button">Lưu liên kết</button></div><p id="costMapStatus" class="muted"></p><p id="costMapList" class="muted"></p></details>'+ 
 '<div class="ehs-cost-dual">'+Object.keys(kinds).map(type=>'<section class="ehs-cost-panel"><div class="ehs-cost-heading"><h3>'+esc(kinds[type].title)+'</h3><span id="costDashboardMeta'+type+'" class="muted"></span></div><div class="ehs-cost-tablewrap" id="costDashboard'+type+'"></div></section>').join('')+'</div></div>';
 $('costDashboardPeriod').onchange=()=>{chosen=$('costDashboardPeriod').value;render()};
 $('costDashboardExport').onclick=exportExcel;
 $('costMapSave').onclick=saveMapping;
 document.addEventListener('ehs-language-change',render);
 choosePeriods();renderMapping();render();
}
export function setCostExplorerRecords(rows){
 records=Array.isArray(rows)?rows.slice():[];
 if(!$('costExplorerMount'))return;
 choosePeriods();renderMapping();render();
}