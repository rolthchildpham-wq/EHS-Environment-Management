import {reconcile} from './ehs-financial-reconcile.js?v=20261111c';
import {mountOCR} from './ehs-ocr.js?v=20261111b';
import {collection,doc,getDoc,getDocs,query,limit,orderBy,writeBatch,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {parseWorkbook,asDay,validateOperation} from './ehs-excel-adapters.js?v=20261111b';
const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const flowKeys={industrial_cost:'Chi phí rác công nghiệp',domestic_cost:'Chi phí rác sinh hoạt',hazardous_cost:'Chi phí rác nguy hại',scrap_revenue:'Doanh thu phế liệu'};
const signedWaste=x=>x===null||x===undefined?'—':(x>0?'+':'')+money(x);
const cashFlow=r=>r.kind==='monthly_master'&&Object.hasOwn(flowKeys,r.name)?(r.name==='scrap_revenue'?Math.abs(r.quantity):-Math.abs(r.quantity)):null;
const kinds={waste:'Rác thải (A.1)',water_in:'Nước xử lý (A.2)',water_out:'Nước xả (A.2)',stock_in:'Nhập kho (入库)',stock_out:'Xuất kho (出库)',stock_opening:'Tồn đầu kỳ (收发存)',water_cost_month:'Chi tiết chi phí XLNT (A.3)',water_cost_total:'Tổng chi phí XLNT (A.3)',green_cost_detail:'Chi tiết cây xanh (C)',green_cost_total:'Tổng chi phí cây xanh (C)',water_cost_reference:'Chi phí phụ biểu tham chiếu',waste_finance_month:'Thu chi rác tháng',monthly_reference:'Tham chiếu báo cáo tháng',waste_detail_reference:'Chi tiết rác tham chiếu',scrap_detail_reference:'Phế liệu tham chiếu'};
let db=null,user=null,role=null,pending=[],operations=[],refreshFn=null,lastWarning=[],lastFound=[],selected=0,lastFinancial=null;
const notify=s=>{if(el('opsMessage'))el('opsMessage').textContent=s};
const fields=[
 ['date','Ngày','date'],['kind','Nghiệp vụ','kind'],['name','Tên rác / vật tư / chỉ tiêu','text'],
 ['code','Mã vật tư','text'],['nameZh','Tên tiếng Trung','text'],['group','Nhóm rác / nhóm chi phí','text'],
 ['quantity','Số lượng / m³ trong ngày','number'],['unit','Đơn vị','text'],['meter','Chỉ số đồng hồ hiện tại','number'],
 ['previous','Chỉ số đồng hồ trước','number'],['spec','Quy cách','text'],['worker','Nhân viên','text'],
 ['price','Đơn giá (VND)','number'],['amount','Thành tiền (VND)','number'],['note','Ghi chú','text']
];
function manualModel(){
 const kind=el('opsKind').value;
 const model=fields.filter(([name])=>{
  const map={
   waste:['date','kind','name','nameZh','group','quantity','unit','note'],
   water_in:['date','kind','quantity','unit','meter','previous','note'],
   water_out:['date','kind','quantity','unit','meter','previous','note'],
   stock_in:['date','kind','code','name','spec','quantity','unit','worker','price','amount','note'],
   stock_opening:['date','kind','code','name','spec','quantity','unit','note'],
   stock_out:['date','kind','code','name','spec','quantity','unit','worker','note'],
   water_cost_month:['date','kind','name','quantity','unit','price','note'],
   water_cost_total:['date','kind','quantity','unit','note'],
   green_cost_detail:['date','kind','name','quantity','unit','price','note'],
   green_cost_total:['date','kind','quantity','unit','note'],
   waste_finance_month:['date','kind','name','quantity','unit','note']
  };return map[kind]?.includes(name);
 });
 el('opsManualFields').innerHTML=model.map(([k,label,type])=>{
  if(type==='kind')return '';
  return '<label>'+safe(label)+'<input data-op-field="'+k+'" type="'+(type==='number'?'number':type)+'" '+(type==='number'?'step="any" min="0" ':'')+
    (k==='date'?'value="'+new Date().toISOString().slice(0,10)+'"':'')+' placeholder="'+safe(label)+'"></label>';
 }).join('');
 const unit=el('opsManualFields').querySelector('[data-op-field="unit"]');
 if(unit)unit.value=kind==='waste'?'kg':kind.startsWith('water_')&&kind!=='water_cost_month'?'m³':(['water_cost_month','water_cost_total','green_cost_detail','green_cost_total','waste_finance_month'].includes(kind))?'VND':'';
}
function formRecord(){
 const kind=el('opsKind').value,obj={kind,quantity:NaN,sourceFile:'Nhập tay',sourceSheet:'Manual',sourceRow:Date.now(),year:0};
 el('opsManualFields').querySelectorAll('[data-op-field]').forEach(x=>{
  const k=x.dataset.opField;
  obj[k]=['quantity','meter','previous','price','amount'].includes(k)?(x.value.trim()===''?null:Number(x.value)):x.value.trim();
 });
 if((kind==='water_in'||kind==='water_out')&&obj.quantity===null&&Number.isFinite(obj.meter)&&Number.isFinite(obj.previous))obj.quantity=obj.meter-obj.previous;
 if(kind==='stock_in'&&obj.amount===null&&Number.isFinite(obj.price)&&Number.isFinite(obj.quantity))obj.amount=obj.quantity*obj.price;
 return obj;
}
function validate(r){
 if(r.quantity===null||r.quantity===undefined||r.quantity==='')return 'Thiếu số lượng';
 const err=validateOperation(r);if(err)return err;
 if(['stock_in','stock_out','stock_opening'].includes(r.kind)&&!String(r.code||'').trim())return 'Thiếu mã vật tư';
 if(r.kind==='waste'&&!String(r.name||'').trim())return 'Thiếu tên loại rác';
 if((r.kind==='water_in'||r.kind==='water_out')&&r.meter!=null&&r.previous!=null&&Number(r.meter)<Number(r.previous))return 'Chỉ số đồng hồ hiện tại nhỏ hơn lần trước';
 return '';
}
function editRow(index){
 const record=pending[index];if(!record)return;
 const keys=['date','name','code','nameZh','group','quantity','unit','spec','worker','meter','previous','price','amount','note'];
 const labels={date:'Ngày',name:'Tên',code:'Mã vật tư',nameZh:'Tên tiếng Trung',group:'Phân loại',quantity:'Số lượng',unit:'Đơn vị',spec:'Quy cách',worker:'Người thực hiện',meter:'Chỉ số hiện tại',previous:'Chỉ số trước',price:'Đơn giá',amount:'Thành tiền',note:'Ghi chú'};
 const modal=el('opsEditor');
 modal.innerHTML='<div style="max-width:760px;max-height:80vh;overflow:auto"><h3>Sửa dòng '+(index+1)+'</h3><div class="controls">'+
  keys.map(k=>'<label>'+safe(labels[k])+'<input data-edit-field="'+k+'" type="'+(k==='date'?'date':['quantity','meter','previous','price','amount'].includes(k)?'number':'text')+'" '+(['quantity','meter','previous','price','amount'].includes(k)?'step="any" ':'')+'value="'+safe(record[k]??'')+'"></label>').join('')+
  '</div><div class="controls"><button id="opsEditCancel">Hủy</button><button id="opsEditSave" class="primary">Cập nhật</button></div></div>';
 modal.showModal();
 el('opsEditCancel').onclick=()=>modal.close();
 el('opsEditSave').onclick=()=>{
  modal.querySelectorAll('[data-edit-field]').forEach(input=>{
   const k=input.dataset.editField;
   record[k]=['quantity','meter','previous','price','amount'].includes(k)?
    (input.value.trim()===''?null:Number(input.value)):input.value.trim();
  });
  modal.close();paint();
 };
}

function paint(){
 const sub=pending.slice(selected,selected+100);
 el('opsPreviewRows').innerHTML=sub.map((x,i)=>{
  const ix=i+selected,err=validate(x);
  return '<tr><td><button data-edit="'+ix+'" title="Sửa chi tiết">Sửa</button> <button data-remove="'+ix+'" title="Bỏ dòng">×</button></td>'+
   '<td>'+safe(x.sourceSheet||'Nhập tay')+' #'+safe(x.sourceRow||'')+'</td>'+
   '<td><input aria-label="Ngày dòng '+(ix+1)+'" type="date" data-row-date="'+ix+'" value="'+safe(x.date)+'"></td>'+
   '<td>'+safe(kinds[x.kind]||x.kind)+'</td><td>'+safe(x.name||x.code||'')+'</td>'+
   '<td><input aria-label="Số lượng dòng '+(ix+1)+'" type="number" min="0" step="any" data-row-qty="'+ix+'" value="'+safe(x.quantity)+'"></td>'+
   '<td>'+safe(x.unit)+'</td><td>'+safe(x.code||'')+'</td><td>'+safe(cashFlow(x)===null?'—':signedWaste(cashFlow(x)))+'</td><td>'+safe(err||'Hợp lệ')+'</td></tr>';
 }).join('');
 for(const b of el('opsPreviewRows').querySelectorAll('[data-edit]'))b.onclick=()=>editRow(Number(b.dataset.edit));
 for(const b of el('opsPreviewRows').querySelectorAll('[data-remove]'))b.onclick=()=>{pending.splice(Number(b.dataset.remove),1);selected=Math.min(selected,Math.max(0,pending.length-100));paint()};
 for(const x of el('opsPreviewRows').querySelectorAll('[data-row-date]'))x.onchange=()=>{pending[Number(x.dataset.rowDate)].date=x.value;paint()};
 for(const x of el('opsPreviewRows').querySelectorAll('[data-row-qty]'))x.onchange=()=>{pending[Number(x.dataset.rowQty)].quantity=Number(x.value);paint()};
 const flow=pending.filter(x=>cashFlow(x)!==null);
 const exp=flow.filter(x=>cashFlow(x)<0).reduce((a,x)=>a+Math.abs(cashFlow(x)),0);
 const inc=flow.filter(x=>cashFlow(x)>0).reduce((a,x)=>a+cashFlow(x),0);
 if(el('opsCashflowPreview'))el('opsCashflowPreview').textContent=flow.length?('A.TK: '+flow.length+' dòng thu/chi. Chi phí chất thải: −'+money(exp)+' VND · Thu phế liệu: +'+money(inc)+' VND · Dòng tiền ròng: '+signedWaste(inc-exp)+' VND. Dữ liệu nguồn giữ nguyên để đối chiếu.'):'Chưa có dữ liệu thu/chi A.TK trong danh sách nhập. Hãy chọn file chứa sheet A.TK.';
 const errors=pending.filter(x=>validate(x)).length;
 el('opsPreviewCount').textContent=pending.length+' dòng chờ lưu ('+errors+' dòng cần sửa). Hiện trang '+(Math.floor(selected/100)+1)+'/'+Math.max(1,Math.ceil(pending.length/100));
 el('opsWarnings').innerHTML=lastWarning.slice(0,12).map(s=>'<div>⚠ '+safe(s)+'</div>').join('')+
  (lastWarning.length>12?'<div>…và '+(lastWarning.length-12)+' cảnh báo khác.</div>':'');
}
function recordToDb(x,importId){
 const keys=['date','kind','quantity','unit','name','code','spec','worker','note','price','amount','previous','meter','group','nameZh','sourceSheet','sourceRow','sourceFile','year'];
 const obj={};for(const k of keys){const val=x[k];if(val!==undefined)obj[k]=val===null?null:val;}
 for(const k of ['unit','name','code','note','sourceFile','sourceSheet'])if(typeof obj[k]!=='string')obj[k]=String(obj[k]??'');
 return {...obj,importId,createdBy:user.uid,createdAt:serverTimestamp()};
}
async function stableId(x){
 const key=[x.kind==='monthly_master'&&x.spec==='master-map-v2'?'mapping-v2':'original',x.sourceFile,x.sourceSheet,x.sourceRow,x.kind,x.name,x.code,x.date].join('||');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 return 'xls_'+Array.from(new Uint8Array(hash)).slice(0,20).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function save(){
 if(!user||!['admin','editor'].includes(role))return notify('Bạn cần quyền admin/editor.');
 if(!pending.length)return notify('Chưa có dữ liệu chờ lưu.');
 const invalid=pending.map((r,i)=>[i+1,validate(r)]).filter(([,e])=>e);
 if(invalid.length)return notify('Có '+invalid.length+' dòng lỗi. Ví dụ dòng '+invalid[0][0]+': '+invalid[0][1]);
 if(!confirm('Lưu '+pending.length+' dòng lên Firestore? Trùng bản ghi Excel sẽ được bỏ qua.'))return;
 el('opsSave').disabled=true;
 try{
  let saved=0,duplicates=0;
  const importId=new Date().toISOString();
  // 250 writes per atomic batch. Deterministic Excel IDs and read-before-create avoid duplicate imports.
  for(let i=0;i<pending.length;i+=250){
   const chunk=pending.slice(i,i+250),batch=writeBatch(db);
   let chunkCount=0;
   const refs=await Promise.all(chunk.map(async r=>
    r.sourceFile==='Nhập tay'?doc(collection(db,'operations')):doc(db,'operations',await stableId(r))
   ));
   // Resolve duplicate IDs concurrently in small groups, not one network round-trip per row.
   const exists=new Array(chunk.length).fill(false);
   for(let j=0;j<chunk.length;j+=25){
    const checks=await Promise.all(chunk.slice(j,j+25).map((r,k)=>
     r.sourceFile==='Nhập tay'?Promise.resolve(false):getDoc(refs[j+k]).then(d=>d.exists())
    ));
    checks.forEach((value,k)=>{exists[j+k]=value});
   }
   chunk.forEach((r,j)=>{
    if(exists[j]){duplicates++;return}
    batch.set(refs[j],recordToDb(r,importId));chunkCount++;
   });
   if(chunkCount){await batch.commit();saved+=chunkCount}
   notify('Đã lưu '+saved+'/'+pending.length+' dòng; bỏ qua '+duplicates+' dòng đã tồn tại.');
  }
  pending=[];lastWarning=[];paint();
  if(refreshFn)await refreshFn();else await loadOperations();
  notify('Hoàn tất: '+saved+' dòng được lưu, '+duplicates+' dòng trùng. Các số liệu đã đồng bộ.');
 }catch(e){notify('Lưu chưa hoàn tất: '+e.message+'. Những lô đã lưu trước đó vẫn giữ nguyên; hãy nhập lại file để bỏ qua bản ghi trùng.')}
 finally{el('opsSave').disabled=false}
}
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function makeCsv(rows,name){
 const cols=['date','kind','code','name','nameZh','group','quantity','unit','meter','previous','spec','worker','price','amount','note','sourceFile','sourceSheet'];
 const csv='\ufeff'+cols.join(',')+'\r\n'+rows.map(r=>cols.map(k=>csvCell(r[k])).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const total=(rows,type,field='quantity')=>rows.filter(x=>x.kind===type).reduce((s,x)=>s+Number(x[field]||0),0);
const month=x=>String(x.date||'').slice(0,7);
function report(){
 const from=el('from')?.value||'1900-01-01',to=el('to')?.value||'2100-12-31';
 const all=operations.filter(x=>x.date>=from&&x.date<=to);
 const calc=reconcile(operations,from,to);lastFinancial=calc;
 const n=x=>x===null||x===undefined?'—':money(x);
 const cells=a=>'<tr>'+a.map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>';
 el('opsMonthlyRows').innerHTML=calc.months.map(x=>cells([
  x.month,n(x.wasteKg),n(x.waterIn),n(x.waterOut),n(x.industrialKg),n(x.hazardousKg),
  n(x.industrialCost),n(x.domesticCost),n(x.hazardousCost),n(x.wasteCost),
  n(x.revenue),n(x.waterCost),n(x.costWaterPerM3),n(x.greenCost),n(x.costWastePerKg),
  n(x.stockIn),n(x.stockOut)
 ])).join('');
 const years=new Map();
 for(const x of calc.months){
  const key=x.month.slice(0,4);
  if(!years.has(key))years.set(key,{y:key,wasteKg:0,waterOut:0,industrialCost:0,domesticCost:0,hazardousCost:0,revenue:0,waterCost:0,greenCost:0,kg:0,hasWasteCost:false,hasWaterCost:false,hasGreenCost:false});
  const y=years.get(key);y.wasteKg+=x.wasteKg;y.waterOut+=x.waterOut;y.industrialCost+=x.industrialCost||0;
  y.domesticCost+=x.domesticCost||0;y.hazardousCost+=x.hazardousCost||0;
  y.revenue+=x.revenue||0;y.waterCost+=x.waterCost||0;y.greenCost+=x.greenCost||0;
  y.kg+=(x.industrialKg||0)+(x.hazardousKg||0)+(x.domesticKg||0);
  y.hasWasteCost ||= x.wasteCost!==null;
  y.hasWaterCost ||= x.waterCost!==null;y.hasGreenCost ||= x.greenCost!==null;
 }
 el('opsWasteCashflowRows').innerHTML=calc.months.filter(x=>[x.industrialCost,x.domesticCost,x.hazardousCost,x.revenue].some(v=>v!==null)).map(x=>cells([
  x.month,n(x.industrialKg),n(x.hazardousKg),
  x.industrialCost===null?'—':signedWaste(-Math.abs(x.industrialCost)),
  x.domesticCost===null?'—':signedWaste(-Math.abs(x.domesticCost)),
  x.hazardousCost===null?'—':signedWaste(-Math.abs(x.hazardousCost)),
  x.wasteCost===null?'—':signedWaste(-Math.abs(x.wasteCost)),
  x.revenue===null?'—':signedWaste(Math.abs(x.revenue)),
  n(x.wasteNet===null?null:x.wasteNet)
 ])).join('');
 el('opsYearRows').innerHTML=[...years.values()].map(x=>{
  const cost=x.industrialCost+x.domesticCost+x.hazardousCost;
  return cells([x.y,n(x.wasteKg),n(x.waterOut),x.hasWasteCost?n(cost):'—',
   x.hasWasteCost&&x.kg?n(cost/x.kg):'—',x.hasWaterCost?n(x.waterCost):'—',
   x.hasWaterCost&&x.waterOut?n(x.waterCost/x.waterOut):'—',x.hasGreenCost?n(x.greenCost):'—',n(x.revenue)]);
 }).join('');
 const inventory={};
 for(const x of operations.filter(x=>x.date<=to&&['stock_in','stock_out','stock_opening'].includes(x.kind))){
  const key=[x.code||x.name,x.unit].join('|');
  if(!inventory[key])inventory[key]={code:x.code,name:x.name,unit:x.unit,qty:0,opening:0,in:0,out:0,amount:0};
  inventory[key].qty+=Number(x.quantity)*(x.kind==='stock_out'?-1:1);
  if(x.kind==='stock_opening')inventory[key].opening+=Number(x.quantity);
  else inventory[key][x.kind==='stock_in'?'in':'out']+=Number(x.quantity);
  if(x.kind==='stock_in')inventory[key].amount+=Number(x.amount||0);
 }
 el('opsInventoryRows').innerHTML=Object.values(inventory).sort((a,b)=>a.code.localeCompare(b.code)).map(x=>
  cells([x.code,x.name,x.unit,n(x.opening),n(x.in),n(x.out),n(x.qty),n(x.amount)])).join('');
 const references=calc.raw.filter(x=>['water_cost_reference','waste_detail_reference','scrap_detail_reference','monthly_reference','water_cost_rate_reference','monthly_master'].includes(x.kind));
 el('opsReferenceRows').innerHTML=references.slice(0,800).map(x=>cells([
  x.sourceSheet,x.date,x.name,x.code,n(x.quantity),x.unit,n(x.amount),x.note
 ])).join('');
 const details=(kind)=>calc.raw.filter(x=>x.kind===kind).sort((a,b)=>a.date.localeCompare(b.date)||a.sourceRow-b.sourceRow);
 const detailHtml=(kind)=>details(kind).map(x=>cells([
  x.date.slice(0,7),x.name,n(x.quantity),x.unit,n(x.price),x.sourceSheet+'!'+x.sourceRow
 ])).join('');
 el('opsWaterCostRows').innerHTML=detailHtml('water_cost_month');
 el('opsGreenCostRows').innerHTML=detailHtml('green_cost_detail');
 el('opsReconcileRows').innerHTML=calc.issues.map(x=>cells([
  x.month,x.type==='water_cost'?'Xử lý nước thải':'Cây xanh',n(x.actual),n(x.detail),n(x.difference),
  'Số tổng của Excel được ưu tiên, cần kiểm tra dòng chi tiết'
 ])).join('');
 el('opsDataCount').textContent='Đã tải '+operations.length+' bản ghi. '+(calc.legacyCount?'Cảnh báo: '+calc.legacyCount+' dòng A.TK cũ bị lệch chỉ tiêu đã được loại khỏi báo cáo. Cần nhập lại file Excel gốc để khôi phục số liệu. ':'')+'Báo cáo dùng A.TK đã kiểm tra nhãn dòng, A.3 và C. Tối đa 5.000 bản ghi.';
}
export async function loadOperations(){
 if(!db||!role)return [];
 try{
  const snap=await getDocs(query(collection(db,'operations'),limit(5000)));
  operations=snap.docs.map(d=>({...d.data(),id:d.id})).filter(x=>!validateOperation(x));
  report();return operations;
 }catch(e){notify('Không tải được dữ liệu nghiệp vụ: '+e.message);return []}
}
export function getAllOperations(){return operations.slice()}
export function getOperationalRecords(){
 const calc=reconcile(operations,'1900-01-01','2100-12-31');
 const master=new Set(operations.filter(x=>x.kind==='monthly_master'&&x.spec==='master-map-v2')
   .map(x=>x.date.slice(0,7)+'/'+x.name));
 const records=[];
 for(const x of operations){
  if(!['waste','water_in','water_out','stock_in','stock_out'].includes(x.kind))continue;
  // For dashboard monthly totals prefer management A.TK over daily A.2 when provided.
  if(['water_in','water_out'].includes(x.kind)&&master.has(x.date.slice(0,7)+'/'+x.kind))continue;
  records.push({date:x.date,kind:x.kind,value:x.quantity,unit:x.unit,name:x.name||'',note:x.note||'',source:'operations'});
 }
 for(const x of calc.months){
  const date=x.month+'-01';
  for(const kind of ['water_in','water_out']){
   if(master.has(x.month+'/'+kind))records.push({date,kind,value:x[kind==='water_in'?'waterIn':'waterOut'],unit:'m³',
    name:kind==='water_in'?'Nước xử lý (A.TK)':'Nước xả (A.TK)',note:'Giá trị tháng chính thức từ A.TK',source:'monthly_master'});
  }
  for(const [label,value] of [['water_cost',x.waterCost],['green_cost',x.greenCost],['waste_cost',x.wasteCost]]){
   if(value!==null&&value!==undefined)records.push({date,kind:'cost',value,unit:'VND',name:label,note:'Tổng chính thức từ sheet báo cáo',source:'reconciled'});
  }
  if(x.revenue!==null)records.push({date,kind:'revenue',value:x.revenue,unit:'VND',
    name:'scrap_revenue',note:'Doanh thu phế liệu A.TK',source:'reconciled'});
 }
 return records;
}
export function mountOperations(database,actor,actorRole,onUpdate){
 db=database;user=actor;role=actorRole;refreshFn=onUpdate;
 const host=el('opsMount');
 if(!host)return;
 host.innerHTML='<div class="panel"><h2>Nhập tay & nhập Excel theo cấu trúc gốc</h2>'+
  '<p class="muted">Nhận diện A.1, A.2, 入库, 出库, A.TK, A.3 chi phí nước thải, C chi phí cây xanh và báo cáo thu chi rác. Dữ liệu Excel được kiểm tra trước khi ghi. Chọn năm báo cáo đúng với nội dung các sheet tổng hợp.</p>'+ 
  '<p class="notice">Sheet A.TK: <b>chi phí xử lý chất thải (−)</b>, <b>doanh thu phế liệu (+)</b>. Sau khi đọc Excel, xem phần Thu/chi (+/−) và bảng Thu – chi chất thải trong Báo cáo. Không đổi dấu dữ liệu nguồn.</p>'+
  '<p class="notice">Đã sửa lỗi lệch dòng A.TK của bản nhập cũ. Hãy đọc và lưu lại file Excel 2026 gốc một lần; những bản ghi A.TK cũ sẽ không được dùng để tính báo cáo. Các loại dữ liệu A.1, A.2, A.3, C và vật tư không bị xóa.</p>'+
  '<div class="controls"><label>File Excel gốc<input id="opsFile" type="file" accept=".xlsx,.xls"></label>'+
  '<label>Năm cho sheet báo cáo tháng<input id="opsYear" type="number" min="2015" max="2100" value="2026"></label>'+
  '<button id="opsParse">Đọc và kiểm tra Excel</button></div>'+
  '<p id="opsSheetInfo" class="muted"></p><hr><h3>Nhập dữ liệu thủ công</h3>'+
  '<div class="controls"><label>Loại nhập<select id="opsKind">'+Object.entries(kinds).filter(([k])=>k!=='monthly_reference').map(([k,v])=>'<option value="'+k+'">'+safe(v)+'</option>').join('')+'</select></label></div>'+
  '<div class="controls" id="opsManualFields"></div><button class="primary" id="opsAddManual">Thêm vào danh sách chờ lưu</button>'+
  '<hr><h3>Kiểm tra & chỉnh sửa trước khi lưu</h3>'+
  '<p id="opsPreviewCount"></p><div id="opsWarnings" class="notice"></div>'+
  '<div id="opsCashflowPreview" class="notice" style="margin:10px 0"></div>'+ 
  '<div class="scroll"><table><thead><tr><th>Bỏ</th><th>Nguồn</th><th>Ngày</th><th>Nghiệp vụ</th><th>Tên</th><th>Số lượng gốc</th><th>Đơn vị</th><th>Mã</th><th>Thu/chi (+/−)</th><th>Kiểm tra</th></tr></thead><tbody id="opsPreviewRows"></tbody></table></div>'+
  '<div class="controls" style="margin-top:12px"><button id="opsPrev">100 dòng trước</button><button id="opsNext">100 dòng tiếp</button><button class="primary" id="opsSave">Lưu hàng loạt vào Firestore</button></div>'+
  '<p class="notice" id="opsMessage" role="status" aria-live="polite">Chưa có file Excel nào được đọc.</p><dialog id="opsEditor" aria-label="Sửa dòng Excel"></dialog></div>';
 if(el('opsOcrMount'))el('opsOcrMount').remove();
 host.insertAdjacentHTML('afterend','<div id="opsOcrMount"></div>');
 mountOCR();
 const reportHost=el('opsReport');
 if(reportHost)reportHost.innerHTML='<div class="panel" style="margin-top:18px"><h2>Đối chiếu báo cáo EHS theo Excel chính thức</h2>'+
  '<p class="muted">A.TK là nguồn chuẩn cho chi phí rác, khối lượng theo nhóm, doanh thu phế liệu; A.3 là nguồn chuẩn cho tổng chi phí nước thải; C là nguồn chuẩn cho tổng chi phí cây xanh. Dòng chi tiết giữ nguyên để đối chiếu; không cộng lặp lại tổng.</p><p id="opsDataCount"></p>'+
  '<div class="controls"><button id="opsExportAll">Xuất nghiệp vụ (CSV)</button><button id="opsExportMonth">Xuất báo cáo đối chiếu (Excel nhiều sheet)</button></div>'+
  '<h3>Tổng hợp tháng theo nguồn chuẩn</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th>Rác A.1 kg</th><th>XLNT m³</th><th>Xả m³</th><th>Rác CN kg</th><th>Rác NH kg</th><th>Chi phí CN</th><th>Chi phí SH</th><th>Chi phí NH</th><th>Tổng CP rác</th><th>Thu phế liệu</th><th>CP nước A.3</th><th>CP/m³</th><th>CP cây xanh C</th><th>CP/kg rác</th><th>Phiếu nhập</th><th>Phiếu xuất</th></tr></thead><tbody id="opsMonthlyRows"></tbody></table></div>'+
  '<h3>Thu – chi chất thải (+/−) từ A.TK</h3><p class="muted">Các chi phí có dấu âm (−), thu hồi phế liệu có dấu dương (+). Dòng tiền ròng = doanh thu phế liệu − tổng chi phí xử lý chất thải; không bao gồm chi phí nước thải và cây xanh.</p><div class="scroll"><table><thead><tr><th>Tháng</th><th>Rác CN kg</th><th>Rác NH kg</th><th>Chi phí CN (−)</th><th>Chi phí SH (−)</th><th>Chi phí NH (−)</th><th>Tổng chi (−)</th><th>Thu phế liệu (+)</th><th>Thu–chi ròng</th></tr></thead><tbody id="opsWasteCashflowRows"></tbody></table></div>'+ 
  '<h3>Tổng hợp năm</h3><div class="scroll"><table><thead><tr><th>Năm</th><th>Rác A.1 kg</th><th>Xả m³</th><th>CP rác</th><th>CP/kg</th><th>CP nước</th><th>CP/m³</th><th>CP cây xanh</th><th>Thu phế liệu</th></tr></thead><tbody id="opsYearRows"></tbody></table></div>'+
  '<h3>Chi tiết A.3 – Chi phí xử lý nước thải</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th>Hạng mục</th><th>Chi phí VND</th><th>ĐVT</th><th>Đơn giá</th><th>Sheet, dòng</th></tr></thead><tbody id="opsWaterCostRows"></tbody></table></div>'+
  '<h3>Chi tiết C – Chi phí cây xanh</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th>Hạng mục</th><th>Chi phí VND</th><th>ĐVT</th><th>Đơn giá</th><th>Sheet, dòng</th></tr></thead><tbody id="opsGreenCostRows"></tbody></table></div>'+
  '<h3>Đối chiếu tổng và chi tiết</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th>Nhóm</th><th>Tổng chuẩn</th><th>Tổng chi tiết</th><th>Chênh lệch</th><th>Ghi chú</th></tr></thead><tbody id="opsReconcileRows"></tbody></table></div>'+
  '<h3>Nhập – xuất – tồn vật tư theo mã</h3><div class="scroll"><table><thead><tr><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th>Tồn đầu</th><th>Nhập</th><th>Xuất</th><th>Tồn cuối</th><th>Giá trị nhập</th></tr></thead><tbody id="opsInventoryRows"></tbody></table></div>'+
  '<h3>Ô nguồn trong workbook và bảng tham chiếu</h3><div class="scroll"><table><thead><tr><th>Sheet</th><th>Tháng</th><th>Chỉ tiêu</th><th>Mã</th><th>Giá trị</th><th>ĐVT</th><th>Thành tiền</th><th>Ô Excel / ghi chú</th></tr></thead><tbody id="opsReferenceRows"></tbody></table></div></div>';

 el('opsKind').onchange=manualModel;manualModel();
 el('opsAddManual').onclick=()=>{const x=formRecord();const err=validate(x);if(err)return notify('Dữ liệu nhập tay: '+err);pending.push(x);selected=Math.floor((pending.length-1)/100)*100;paint();notify('Đã thêm vào danh sách chờ lưu. Bấm Lưu hàng loạt để ghi Firestore.')};
 el('opsParse').onclick=async()=>{
  const file=el('opsFile').files[0];if(!file)return notify('Hãy chọn file Excel gốc.');
  if(!window.XLSX)return notify('Trình đọc Excel chưa tải được.');
  try{
   const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
   const result=parseWorkbook(wb,file.name,Number(el('opsYear').value));
   pending=result.items;selected=0;lastWarning=result.warnings;lastFound=result.found;
   el('opsSheetInfo').textContent='Đã nhận diện: '+result.found.map(x=>x.sheet+' ('+kinds[x.type]+')').join('; ');
   paint();notify('Đã đọc '+pending.length+' dòng có số lượng hợp lệ. Kiểm tra ngày và số tiền trước khi lưu.');
  }catch(e){notify('Không đọc được file: '+e.message)}
 };
 el('opsPrev').onclick=()=>{selected=Math.max(0,selected-100);paint()};
 el('opsNext').onclick=()=>{selected=Math.min(Math.max(0,pending.length-100),selected+100);paint()};
 el('opsSave').onclick=save;
 if(el('opsExportAll'))el('opsExportAll').onclick=()=>makeCsv(operations,'EHS_nghiep_vu.csv');
 if(el('opsExportMonth'))el('opsExportMonth').onclick=()=>{
  if(!window.XLSX)return notify('Không có thư viện Excel.');
  const wb=window.XLSX.utils.book_new();
  const add=(rows,name)=>window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(rows),name);
  const m=lastFinancial?.months||[];
  add(m.filter(x=>[x.industrialCost,x.domesticCost,x.hazardousCost,x.revenue].some(v=>v!==null)).map(x=>({
   'Tháng':x.month,
   'Chi phí CN (-VND)':x.industrialCost===null?null:-Math.abs(x.industrialCost),
   'Chi phí SH (-VND)':x.domesticCost===null?null:-Math.abs(x.domesticCost),
   'Chi phí NH (-VND)':x.hazardousCost===null?null:-Math.abs(x.hazardousCost),
   'Tổng chi (-VND)':x.wasteCost===null?null:-Math.abs(x.wasteCost),
   'Doanh thu PL (+VND)':x.revenue===null?null:Math.abs(x.revenue),
   'Thu chi ròng (VND)':x.wasteNet
  })),'Thu chi chat thai');
  add(m.map(x=>({
   'Tháng':x.month,'Rác A.1 (kg)':x.wasteKg,
   'Nước xử lý (m³)':x.waterIn,'Nước xả (m³)':x.waterOut,
   'Rác CN (kg)':x.industrialKg,'Rác NH (kg)':x.hazardousKg,
   'Chi phí CN (VND)':x.industrialCost,'Chi phí SH (VND)':x.domesticCost,
   'Chi phí NH (VND)':x.hazardousCost,'Tổng chi phí rác (VND)':x.wasteCost,
   'Doanh thu phế liệu (VND)':x.revenue,'Chi phí A.3 (VND)':x.waterCost,
   'Chi phí nước (VND/m³)':x.costWaterPerM3,'Chi phí cây xanh C (VND)':x.greenCost,
   'Chi phí rác (VND/kg)':x.costWastePerKg,
   'Nguồn chi phí nước':x.waterSource,'Nguồn chi phí rác':x.wasteSource
  })),'Tong hop thang');
  const ymap=new Map();
  for(const x of m){
   const y=x.month.slice(0,4);
   if(!ymap.has(y))ymap.set(y,{Nam:Number(y),Nuoc_xa_m3:0,Rac_A1_kg:0,CP_nuoc_VND:0,CP_cay_xanh_VND:0,CP_rac_VND:0,Doanh_thu_phe_lieu_VND:0});
   const d=ymap.get(y);d.Nuoc_xa_m3+=x.waterOut||0;d.Rac_A1_kg+=x.wasteKg||0;
   d.CP_nuoc_VND+=x.waterCost||0;d.CP_cay_xanh_VND+=x.greenCost||0;
   d.CP_rac_VND+=x.wasteCost||0;d.Doanh_thu_phe_lieu_VND+=x.revenue||0;
  }
  add([...ymap.values()],'Tong hop nam');
  const detail=(kind)=>operations.filter(x=>x.kind===kind).map(x=>({
   'Tháng':x.date.slice(0,7),'Hạng mục':x.name,'Số tiền VND':x.quantity,
   'Đơn giá VND':x.price,'Nguồn':x.sourceSheet,'Dòng Excel':x.sourceRow,
   'File gốc':x.sourceFile,'Ghi chú':x.note
  }));
  add(detail('water_cost_month'),'Chi tiet A3');
  add(detail('green_cost_detail'),'Chi tiet Cay Xanh C');
  add((lastFinancial?.issues||[]).map(x=>({'Tháng':x.month,'Nhóm':x.type,
    'Tổng chuẩn':x.actual,'Tổng chi tiết':x.detail,'Chênh lệch':x.difference})),'Doi chieu chenhlech');
  add(operations.filter(x=>x.kind==='monthly_master').map(x=>({
   'Tháng':x.date.slice(0,7),'Chỉ tiêu':x.name,'Giá trị':x.quantity,
   'Đơn vị':x.unit,'Thu chi (+/- VND)':cashFlow(x),'Ô nguồn':x.note,'File gốc':x.sourceFile
  })),'A TK Goc');
  add(operations.filter(x=>['stock_in','stock_out','stock_opening'].includes(x.kind))
    .map(x=>({'Ngày':x.date,'Loại':x.kind,'Mã':x.code,'Tên':x.name,
      'Số lượng':x.quantity,'ĐVT':x.unit,'Đơn giá':x.price,'Thành tiền':x.amount,
      'File':x.sourceFile,'Sheet':x.sourceSheet,'Dòng':x.sourceRow
    })),'Nhap Xuat Ton');
  window.XLSX.writeFile(wb,'EHS_Bao_Cao_Doi_Chieu_A_TK_A3_C.xlsx');
 };
 paint();report();
}

export function renderOperationsReport(){if(el('opsMonthlyRows')&&el('opsReport')&&operations.length)report();}
export function unmountOperations(){db=null;user=null;role=null;refreshFn=null;pending=[];operations=[];selected=0;lastWarning=[];if(el('opsMount'))el('opsMount').innerHTML='';if(el('opsOcrMount'))el('opsOcrMount').remove();if(el('opsReport'))el('opsReport').innerHTML='';}
