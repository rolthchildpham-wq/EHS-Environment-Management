import {getLanguage,t} from './i18n.js';
import {displaySourceName,translateUnknownRecords,translationState,manualOverride} from './source-terms.js';
import {reconcile} from './ehs-financial-reconcile.js';
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
function getRows(){
 const key=types[selected].kind,ym=$('costExplorerMonth')?.value;
 return preferred(all.filter(x=>x.kind===key&&month(x)===ym));
}
function updatePeriods(){
 const years=[...new Set(all.filter(x=>Object.values(types).some(t=>t.kind===x.kind)).map(x=>month(x)).filter(Boolean))].sort().reverse();
 const selector=$('costExplorerMonth');if(!selector)return;
 const old=selector.value,desired=$('from')?.value?.slice(0,7);
 selector.innerHTML=years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
 selector.value=years.includes(old)?old:years.includes(desired)?desired:(years[0]||'');
}
function render(){
 if(!$('costExplorerMount'))return;
 const lang=getLanguage(),rows=getRows(),period=$('costExplorerMonth').value;
 const filter=normalize($('costItemSearch')?.value||'');
 const group=types[selected].kind;
 const full=rows.filter(x=>(normalize(x.name)+' '+normalize(x.nameVi)+' '+normalize(x.nameZh)+' '+normalize(x.costGroup)).includes(filter));
 const official=reconcile(all,period+'-01',period+'-31').months.find(x=>x.month===period);
 const total=group==='water_cost_month'?official?.waterCost:official?.greenCost;
 const lineSum=rows.reduce((sum,x)=>sum+Number(x.quantity||0),0);
 const delta=total===null||total===undefined?null:total-lineSum;
 const columns=[t('Nhóm chi phí'),t('Hạng mục'),t('Lượng tiêu thụ'),t('Đơn vị gốc'),t('Đơn giá (VND)'),t('Thành tiền (VND)'),t('Ô Excel'),t('Tên gốc Việt / Trung')];
 $('costExplorerRows').innerHTML=full.length?full.map(x=>'<tr>'+
 [
 x.costGroup||'—',
 displaySourceName(x,lang),
 n(consumedQuantity(x)),consumedUnit(x),
 n(x.price),n(x.amount??x.quantity),
 x.sourceSheet+'!'+x.sourceRow,
 x.name||''
 ].map((v,i)=>'<td '+(i===7?'data-no-translate':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join(''):
 '<tr><td colspan="8">'+esc(t('Chưa có dòng chi tiết. Hãy nhập lại workbook chứa sheet A.3 và C.'))+'</td></tr>';
 $('costExplorerHead').innerHTML=columns.map(h=>'<th>'+esc(h)+'</th>').join('');
 $('costExplorerType').value=selected;
 const missing=translationState().missing.length;
 $('costExplorerTotals').textContent=t('Tổng chi tiết')+': '+n(rows.length?lineSum:null)+' VND · '+t('Tổng theo Excel')+': '+n(total??null)+' VND · '+t('Chênh lệch')+': '+n(delta)+' VND.';
 $('costExplorerStatus').textContent=rows.length?(delta!==null&&Math.abs(delta)>1?t('Có chênh lệch; kiểm tra các dòng nguồn và nhập lại workbook chi tiết.'):(t('Đã có')+' '+rows.length+' '+t('dòng chi tiết')+'. '+(rows.every(x=>x.spec==='cost-detail-v3')?t('Đã có lượng tiêu thụ và đơn giá từ Excel.'):t('Dữ liệu cũ có thể thiếu lượng tiêu thụ; hãy nhập lại workbook.')))):
 t('Chưa có dữ liệu chi tiết. Nhập lại workbook gốc A.3 và C.');
 if(missing&&lang!=='vi')$('costExplorerStatus').textContent+=' '+missing+' '+t('tên chưa có bản dịch tự động.');
}
function exportRows(){
 if(!window.XLSX)return alert('Không tải được công cụ xuất Excel.');
 const wb=window.XLSX.utils.book_new();
 const groups=[{type:'water',name:'A3 nuoc thai'},{type:'green',name:'C cay xanh'}];
 for(const {type,name} of groups){
  const byMonth=new Map();
  for(const x of all.filter(x=>x.kind===types[type].kind)){
   const k=month(x);if(!byMonth.has(k))byMonth.set(k,[]);
   byMonth.get(k).push(x);
  }
  const lines=[...byMonth.entries()].flatMap(([,v])=>preferred(v));
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
 window.XLSX.writeFile(wb,'EHS_Chi_tiet_A3_C_'+new Date().toISOString().slice(0,10)+'.xlsx');
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
 '<div class="controls"><label>'+esc(t('Loại báo cáo'))+'<select id="costExplorerType"><option value="water">'+esc(t(types.water.label))+'</option><option value="green">'+esc(t(types.green.label))+'</option></select></label>'+
 '<label>'+esc(t('Tháng chi tiết'))+'<select id="costExplorerMonth"></select></label><label>'+esc(t('Tìm hạng mục'))+'<input id="costItemSearch" placeholder="PAC, NaOH, nhân công, phân bón..."></label>'+
 '<button id="costExcelExport">'+esc(t('Xuất chi tiết A.3 & C (Excel)'))+'</button><button id="costTranslate">'+esc(t('Dịch tên hạng mục trên thiết bị'))+'</button>'+
 '<button id="costManualTranslate">'+esc(t('Hiệu chỉnh bản dịch'))+'</button></div>'+
 '<div class="notice" id="costExplorerTotals"></div><p class="muted" id="costExplorerStatus"></p>'+
 '<div class="scroll" style="max-height:580px"><table><thead><tr id="costExplorerHead"></tr></thead><tbody id="costExplorerRows"></tbody></table></div></div>';
 $('costExplorerType').onchange=()=>{selected=$('costExplorerType').value;render()};
 $('costExplorerMonth').onchange=render;
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
