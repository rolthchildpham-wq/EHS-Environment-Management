import {getLanguage,t} from './i18n.js?v=20261112f';
import {displaySourceName,translateUnknownRecords,translationState,manualOverride} from './source-terms.js?v=20261112f';
import {reconcile} from './ehs-financial-reconcile.js?v=20261112f';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const n=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(getLanguage()==='en'?'en-US':'vi-VN',{maximumFractionDigits:2});
let all=[],selected='water',busy=false;
const types={water:{kind:'water_cost_month',label:'Chi tiết A.3 – Chi phí xử lý nước thải'},
 green:{kind:'green_cost_detail',label:'Chi tiết C – Chi phí cây xanh'}};
const month=r=>String(r.date||'').slice(0,7);
const normalize=x=>String(x||'').toLowerCase();
function preferred(rows){
 const v3=rows.filter(x=>x.spec==='cost-detail-v3');
 const pool=v3.length?v3:rows;
 const groups=new Map();
 for(const x of pool){
  const id=x.importId||x.sourceFile||'legacy',stamp=x.createdAt?.seconds||0;
  const prior=groups.get(id)||{stamp,rows:[]};
  prior.stamp=Math.max(prior.stamp,stamp);prior.rows.push(x);groups.set(id,prior);
 }
 const latest=[...groups.values()].sort((a,b)=>b.stamp-a.stamp)[0];
 return latest?.rows||[];
}
const consumedQuantity=x=>{
 if(x.consumedQuantity!==null&&x.consumedQuantity!==undefined)return Number(x.consumedQuantity);
 const match=String(x.note||'').match(/(?:tiêu thụ|sử dụng)\s+([\d.,]+)\s+(.+)$/i);
 return match?Number(match[1].replace(',','.')):null;
};
const consumedUnit=x=>{
 if(x.consumedUnit)return x.consumedUnit;
 const match=String(x.note||'').match(/(?:tiêu thụ|sử dụng)\s+[\d.,]+\s+(.+)$/i);
 return match?.[1]||'—';
};
function rowsFor(type){
 const key=types[type].kind,ym=$('costExplorerMonth')?.value||'all',year=$('costExplorerYear')?.value||'all';
 const byMonth=new Map();
 for(const x of all.filter(x=>x.kind===key&&(year==='all'||month(x).startsWith(year))&&(ym==='all'||month(x).slice(5,7)===ym))){
  const k=month(x);if(!byMonth.has(k))byMonth.set(k,[]);byMonth.get(k).push(x);
 }
 return [...byMonth.values()].flatMap(preferred);
}
function getRows(){return rowsFor(selected)}
function filteredRows(type=selected){
 const group=$('costExplorerGroup')?.value||'all',item=$('costExplorerItem')?.value||'all',filter=normalize($('costItemSearch')?.value||'');
 return rowsFor(type).filter(x=>(group==='all'||x.costGroup===group)&&(item==='all'||costName(x)===item)
  &&(!filter||[x.name,x.nameVi,x.nameZh,x.costGroup].some(v=>normalize(v).includes(filter))));
}
const costName=x=>String(x.nameVi||x.name||'').split(/\r?\n/)[0].trim();
function setFilterOptions(id,values){
 const e=$(id);if(!e)return;const old=e.value;
 const vals=[...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
 e.innerHTML='<option value="all">Tất cả</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
 e.value=vals.includes(old)?old:'all';
}
function updateItems(){
 const group=$('costExplorerGroup')?.value||'all';
 setFilterOptions('costExplorerItem',getRows().filter(x=>group==='all'||x.costGroup===group).map(costName));
}
function updateCategories(){
 setFilterOptions('costExplorerGroup',getRows().map(x=>x.costGroup));
 updateItems();
}
function updateMonths(){
 const sel=$('costExplorerMonth');if(!sel)return;
 const year=$('costExplorerYear')?.value||'all',old=sel.value;
 const months=[...new Set(all.filter(x=>Object.values(types).some(t=>t.kind===x.kind))
  .map(x=>month(x)).filter(v=>year==='all'||v.startsWith(year)).map(v=>v.slice(5,7)))].sort();
 sel.innerHTML='<option value="all">Tất cả các tháng</option>'+months.map(v=>'<option value="'+esc(v)+'">Tháng '+esc(v)+'</option>').join('');
 sel.value=months.includes(old)?old:'all';updateCategories();
}
function updatePeriods(){
 const years=[...new Set(all.filter(x=>Object.values(types).some(t=>t.kind===x.kind)).map(x=>month(x).slice(0,4)).filter(Boolean))].sort().reverse();
 const sel=$('costExplorerYear');if(!sel)return;const old=sel.value,desired=$('from')?.value?.slice(0,4);
 sel.innerHTML='<option value="all">Tất cả các năm</option>'+years.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
 sel.value=years.includes(old)?old:years.includes(desired)?desired:(years[0]||'all');updateMonths();
}
function render(){
 if(!$('costExplorerMount'))return;
 const lang=getLanguage(),rows=getRows(),full=filteredRows(),group=types[selected].kind;
 const months=[...new Set(rows.map(x=>month(x)))];
 const reconciled=reconcile(all,'1900-01-01','2100-12-31').months.filter(x=>months.includes(x.month));
 const values=reconciled.map(x=>group==='water_cost_month'?x.waterCost:x.greenCost).filter(v=>v!==null&&v!==undefined);
 const total=values.length?values.reduce((a,v)=>a+Number(v),0):null;
 const lineSum=full.reduce((a,x)=>a+Number(x.amount??x.quantity??0),0);
 const fullSum=rows.reduce((a,x)=>a+Number(x.amount??x.quantity??0),0);
 const delta=total===null||full.length!==rows.length?null:total-fullSum;
 const columns=['Tháng',t('Nhóm chi phí'),t('Hạng mục'),t('Lượng tiêu thụ'),t('Đơn vị gốc'),t('Đơn giá (VND)'),t('Thành tiền (VND)'),t('Ô Excel'),t('Tên gốc Việt / Trung')];
 const ordered=full.slice().sort((a,b)=>String(a.costGroup||'').localeCompare(String(b.costGroup||''),'vi')||month(a).localeCompare(month(b))||costName(a).localeCompare(costName(b),'vi'));
 const tableRows=[];let currentGroup=null,bucket=[];
 const addSubtotal=()=>{
  if(!bucket.length)return;
  const count=bucket.length,amt=bucket.reduce((sum,x)=>sum+Number(x.amount??x.quantity??0),0);
  tableRows.push('<tr class="ehs-cost-subtotal"><td colspan="6">Cộng nhóm '+esc(currentGroup)+' ('+count+' dòng)</td><td>'+esc(n(amt))+'</td><td colspan="2">VND</td></tr>');
 };
 for(const x of ordered){
  const g=x.costGroup||'Chưa phân nhóm';
  if(g!==currentGroup){addSubtotal();bucket=[];currentGroup=g;tableRows.push('<tr class="ehs-cost-group"><th colspan="9">'+esc(g)+'</th></tr>')}
  bucket.push(x);
  tableRows.push('<tr>'+[month(x),g,displaySourceName(x,lang),n(consumedQuantity(x)),consumedUnit(x),n(x.price),n(x.amount??x.quantity),x.sourceSheet+'!'+x.sourceRow,x.name||''].map((v,i)=>'<td '+(i===8?'data-no-translate':'')+'>'+esc(v)+'</td>').join('')+'</tr>');
 }
 addSubtotal();
 if(ordered.length)tableRows.push('<tr class="ehs-cost-grand-total"><td colspan="6">TỔNG CỘNG ('+ordered.length+' dòng)</td><td>'+esc(n(lineSum))+'</td><td colspan="2">VND</td></tr>');
 $('costExplorerRows').innerHTML=tableRows.join('')||'<tr><td colspan="9">Không có dữ liệu theo bộ lọc đang chọn.</td></tr>';
 $('costExplorerHead').innerHTML=columns.map(h=>'<th>'+esc(h)+'</th>').join('');
 $('costExplorerType').value=selected;
 const missing=translationState().missing.length;
 $('costExplorerTotals').textContent='Đang hiển thị '+full.length+'/'+rows.length+' dòng · Tổng sau lọc: '+n(full.length?lineSum:null)+' VND · Tổng gốc các tháng: '+n(total)+' VND · '+(delta===null?'Chênh lệch chỉ tính khi xem toàn bộ hạng mục.':'Chênh lệch: '+n(delta)+' VND.');
 $('costExplorerStatus').textContent=rows.length?(delta!==null&&Math.abs(delta)>1?t('Có chênh lệch; kiểm tra các dòng nguồn và nhập lại workbook chi tiết.'):(t('Đã có')+' '+rows.length+' '+t('dòng chi tiết')+'. '+(rows.every(x=>x.spec==='cost-detail-v3')?t('Đã có lượng tiêu thụ và đơn giá từ Excel.'):t('Dữ liệu cũ có thể thiếu lượng tiêu thụ; hãy nhập lại workbook.')))):
 t('Chưa có dữ liệu chi tiết. Nhập lại workbook gốc A.3 và C.');
 if(missing&&lang!=='vi')$('costExplorerStatus').textContent+=' '+missing+' '+t('tên chưa có bản dịch tự động.');
}
function exportRows(){
 if(!window.XLSX)return alert('Không tải được công cụ xuất Excel.');
 const wb=window.XLSX.utils.book_new();
 const groups=[{type:selected,name:selected==='water'?'A3 nuoc thai':'C cay xanh'}];
 for(const {type,name} of groups){
  const lines=filteredRows(type);
  const data=lines.map(x=>({
   'Tháng':month(x),'Nhóm':x.costGroup,
   'Hạng mục gốc':x.name,
   'Tên tiếng Việt':x.nameVi||String(x.name||'').split('\n')[0],
   'Tên tiếng Trung':x.nameZh||String(x.name||'').split('\n').slice(1).join(' '),
   'Hiển thị ngôn ngữ đã chọn':displaySourceName(x),
   'Số lượng tiêu thụ':consumedQuantity(x),
   'Đơn vị gốc':consumedUnit(x),
   'Đơn giá (VND)':x.price,'Thành tiền (VND)':x.amount??x.quantity,
   'Sheet nguồn':x.sourceSheet,'Dòng nguồn':x.sourceRow,
   'File nguồn':x.sourceFile,'Ghi chú':x.note
  }));
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(data.length?data:[{'Ghi chú':'Chưa có dữ liệu chi tiết'}]),name);
 }
 window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(groups.map(g=>({'Báo cáo':types[g.type].label,'Số dòng':filteredRows(g.type).length,'Tổng VND':filteredRows(g.type).reduce((a,x)=>a+Number(x.amount??x.quantity??0),0)}))),'Tong hop');
 window.XLSX.writeFile(wb,'EHS_A3_C_Da_loc_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
async function translateMissing(){
 if(busy)return;
 const rows=getRows(),lang=getLanguage();if(lang==='vi')return;
 busy=true;$('costTranslate').disabled=true;
 try{
  $('costExplorerStatus').textContent=t('Đang dịch trên thiết bị, không gửi tài liệu lên máy chủ...');
  const count=await translateUnknownRecords(rows,lang);
  render();$('costExplorerStatus').textContent=t('Đã dịch thêm')+' '+count+' '+t('hạng mục; cần kiểm tra thuật ngữ kỹ thuật.');
 }catch(e){$('costExplorerStatus').textContent=e.message}
 finally{busy=false;$('costTranslate').disabled=false}
}
function adjustName(){
 const rows=getRows();const list=rows.map((x,i)=>String(i+1)+'. '+String(x.nameVi||x.name||'').split('\n')[0]).join('\n');
 if(!rows.length)return;
 const k=prompt(t('Chọn số thứ tự hạng mục cần bổ sung bản dịch')+':\n'+list,'1');
 if(k===null)return;const x=rows[Number(k)-1];if(!x)return;
 const lang=getLanguage();if(lang==='vi')return alert('Hãy chuyển sang English hoặc 中文.');
 const translated=prompt(t('Nhập bản dịch được kiểm tra')+':',displaySourceName(x,lang));
 if(!translated||translated.startsWith('⚠'))return;
 manualOverride(x.nameVi||x.name,lang,translated);
 render();
}
export function initCostExplorer(){
 const mount=$('costExplorerMount');if(!mount)return;
 mount.innerHTML='<div class="panel" style="margin-bottom:16px;border:1px solid #b5d5d8"><h2>'+esc(t('Sổ chi tiết A.3 nước thải và C cây xanh'))+'</h2>'+
 '<p class="muted">'+esc(t('Hiển thị chi tiết theo tháng: hạng mục, lượng tiêu thụ, đơn vị gốc, đơn giá, thành tiền, nguồn Excel. Giá trị gốc không bị dịch hoặc sửa.'))+'</p>'+
 '<div class="controls ehs-compact-filters"><label>'+esc(t('Loại báo cáo'))+'<select id="costExplorerType"><option value="water">'+esc(t(types.water.label))+'</option><option value="green">'+esc(t(types.green.label))+'</option></select></label>'+
 '<label>Năm<select id="costExplorerYear"></select></label><label>Tháng<select id="costExplorerMonth"></select></label>'+
 '<label>Nhóm chi phí<select id="costExplorerGroup"><option value="all">Tất cả</option></select></label>'+
 '<label>Tên loại chi phí<select id="costExplorerItem"><option value="all">Tất cả</option></select></label>'+
 '<label>'+esc(t('Tìm hạng mục'))+'<input id="costItemSearch" placeholder="PAC, NaOH, nhân công, phân bón..."></label>'+
 '<button id="costExcelExport">'+esc(t('Xuất chi tiết A.3 & C (Excel)'))+'</button><button id="costTranslate">'+esc(t('Dịch tên hạng mục trên thiết bị'))+'</button>'+
 '<button id="costManualTranslate">'+esc(t('Hiệu chỉnh bản dịch'))+'</button></div>'+
 '<div class="notice" id="costExplorerTotals"></div><p class="muted" id="costExplorerStatus"></p>'+
 '<div class="scroll" style="max-height:580px"><table><thead><tr id="costExplorerHead"></tr></thead><tbody id="costExplorerRows"></tbody></table></div></div>';
 $('costExplorerType').onchange=()=>{selected=$('costExplorerType').value;updateCategories();render()};
 $('costExplorerYear').onchange=()=>{updateMonths();render()};
 $('costExplorerMonth').onchange=()=>{updateCategories();render()};
 $('costExplorerGroup').onchange=()=>{updateItems();render()};
 $('costExplorerItem').onchange=render;
 $('costItemSearch').oninput=render;
 $('costExcelExport').onclick=exportRows;
 $('costTranslate').onclick=translateMissing;
 $('costManualTranslate').onclick=adjustName;
 document.addEventListener('ehs-language-change',()=>{render()});
 updatePeriods();render();
}
export function setCostExplorerRecords(rows){
 all=Array.isArray(rows)?rows.slice():[];
 if(!$('costExplorerMount'))return;
 updatePeriods();render();
}
