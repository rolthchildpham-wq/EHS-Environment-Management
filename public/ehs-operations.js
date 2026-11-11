import {collection,doc,getDoc,getDocs,query,limit,orderBy,writeBatch,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {parseWorkbook,asDay,validateOperation} from './ehs-excel-adapters.js';
const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
const kinds={waste:'Rác thải (A.1)',water_in:'Nước xử lý (A.2)',water_out:'Nước xả (A.2)',stock_in:'Nhập kho (入库)',stock_out:'Xuất kho (出库)',stock_opening:'Tồn đầu kỳ (收发存)',water_cost_month:'Chi phí XLNT tháng (A.3)',waste_finance_month:'Thu chi rác tháng',monthly_reference:'Tham chiếu báo cáo tháng',waste_detail_reference:'Chi tiết rác tham chiếu',scrap_detail_reference:'Phế liệu tham chiếu'};
let db=null,user=null,role=null,pending=[],operations=[],refreshFn=null,lastWarning=[],lastFound=[],selected=0;
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
   water_cost_month:['date','kind','name','quantity','unit','note'],
   waste_finance_month:['date','kind','name','quantity','unit','note']
  };return map[kind]?.includes(name);
 });
 el('opsManualFields').innerHTML=model.map(([k,label,type])=>{
  if(type==='kind')return '';
  return '<label>'+safe(label)+'<input data-op-field="'+k+'" type="'+(type==='number'?'number':type)+'" '+(type==='number'?'step="any" min="0" ':'')+
    (k==='date'?'value="'+new Date().toISOString().slice(0,10)+'"':'')+' placeholder="'+safe(label)+'"></label>';
 }).join('');
 const unit=el('opsManualFields').querySelector('[data-op-field="unit"]');
 if(unit)unit.value=kind==='waste'?'kg':kind.startsWith('water_')&&kind!=='water_cost_month'?'m³':kind.endsWith('_month')?'VND':'';
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
function paint(){
 const sub=pending.slice(selected,selected+100);
 el('opsPreviewRows').innerHTML=sub.map((x,i)=>{
  const ix=i+selected,err=validate(x);
  return '<tr><td><button data-remove="'+ix+'" title="Bỏ dòng">×</button></td>'+
   '<td>'+safe(x.sourceSheet||'Nhập tay')+' #'+safe(x.sourceRow||'')+'</td>'+
   '<td><input aria-label="Ngày dòng '+(ix+1)+'" type="date" data-row-date="'+ix+'" value="'+safe(x.date)+'"></td>'+
   '<td>'+safe(kinds[x.kind]||x.kind)+'</td><td>'+safe(x.name||x.code||'')+'</td>'+
   '<td><input aria-label="Số lượng dòng '+(ix+1)+'" type="number" min="0" step="any" data-row-qty="'+ix+'" value="'+safe(x.quantity)+'"></td>'+
   '<td>'+safe(x.unit)+'</td><td>'+safe(x.code||'')+'</td><td>'+safe(err||'Hợp lệ')+'</td></tr>';
 }).join('');
 for(const b of el('opsPreviewRows').querySelectorAll('[data-remove]'))b.onclick=()=>{pending.splice(Number(b.dataset.remove),1);selected=Math.min(selected,Math.max(0,pending.length-100));paint()};
 for(const x of el('opsPreviewRows').querySelectorAll('[data-row-date]'))x.onchange=()=>{pending[Number(x.dataset.rowDate)].date=x.value;paint()};
 for(const x of el('opsPreviewRows').querySelectorAll('[data-row-qty]'))x.onchange=()=>{pending[Number(x.dataset.rowQty)].quantity=Number(x.value);paint()};
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
 const key=[x.sourceFile,x.sourceSheet,x.sourceRow,x.kind,x.name,x.code,x.date].join('||');
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
   for(const r of chunk){
    const ref=r.sourceFile==='Nhập tay'?doc(collection(db,'operations')):doc(db,'operations',await stableId(r));
    if(r.sourceFile!=='Nhập tay'){
     const existing=await getDoc(ref);
     if(existing.exists()){duplicates++;continue}
    }
    batch.set(ref,recordToDb(r,importId));chunkCount++;
   }
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
 const from=el('from')?.value||'2000-01-01',to=el('to')?.value||'2099-12-31',rows=operations.filter(x=>x.date>=from&&x.date<=to);
 const monthGroups={};
 for(const r of rows){
  const m=month(r);if(!monthGroups[m])monthGroups[m]={month:m,waste:0,in:0,out:0,stockIn:0,stockOut:0,waterCost:0,industrialCost:0,hazardousCost:0,industrialKg:0,hazardousKg:0,scrapRevenue:0};
  const p=monthGroups[m];
  if(r.kind==='waste')p.waste+=Number(r.quantity);
  if(r.kind==='water_in')p.in+=Number(r.quantity);
  if(r.kind==='water_out')p.out+=Number(r.quantity);
  if(r.kind==='stock_in')p.stockIn++;
  if(r.kind==='stock_out')p.stockOut++;
  if(r.kind==='water_cost_month')p.waterCost+=Number(r.quantity);
  if(r.kind==='waste_finance_month'){
   if(r.name==='industrial_cost')p.industrialCost+=Number(r.quantity);
   if(r.name==='industrial_waste_kg')p.industrialKg+=Number(r.quantity);
   if(r.name==='hazardous_waste_kg')p.hazardousKg+=Number(r.quantity);
   if(r.name==='hazardous_cost')p.hazardousCost+=Number(r.quantity);
   if(r.name==='scrap_revenue')p.scrapRevenue+=Number(r.quantity);
  }
 }
 const out=Object.values(monthGroups).sort((a,b)=>a.month.localeCompare(b.month));
 el('opsMonthlyRows').innerHTML=out.map(x=>'<tr>'+[
  x.month,money(x.waste),money(x.in),money(x.out),money(x.stockIn),money(x.stockOut),
  money(x.waterCost),x.out&&x.waterCost?money(x.waterCost/x.out):'—',
  money(x.industrialCost+x.hazardousCost),x.industrialKg+x.hazardousKg?money((x.industrialCost+x.hazardousCost)/(x.industrialKg+x.hazardousKg)):'—',money(x.scrapRevenue)
 ].map(t=>'<td>'+safe(t)+'</td>').join('')+'</tr>').join('');
 const inventory={};
 for(const x of operations.filter(x=>x.date<=to&&['stock_in','stock_out','stock_opening'].includes(x.kind))){
  const key=[x.code||x.name,x.unit].join('|');if(!inventory[key])inventory[key]={code:x.code,name:x.name,unit:x.unit,qty:0,opening:0,in:0,out:0,amount:0};
  inventory[key].qty+=Number(x.quantity)*(x.kind==='stock_out'?-1:1);
  if(x.kind==='stock_opening')inventory[key].opening+=Number(x.quantity);
  else inventory[key][x.kind==='stock_in'?'in':'out']+=Number(x.quantity);
  if(x.kind==='stock_in')inventory[key].amount+=Number(x.amount||0);
 }
 el('opsInventoryRows').innerHTML=Object.values(inventory).sort((a,b)=>a.code.localeCompare(b.code)).map(x=>'<tr>'+
  [x.code,x.name,x.unit,money(x.opening),money(x.in),money(x.out),money(x.qty),money(x.amount)].map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>').join('');
 const yrs={};for(const x of out){const y=x.month.slice(0,4);if(!yrs[y])yrs[y]={y,waste:0,water:0,waterCost:0,wasteCost:0,wasteKg:0,revenue:0};const k=yrs[y];k.waste+=x.waste;k.water+=x.out;k.waterCost+=x.waterCost;k.wasteCost+=x.industrialCost+x.hazardousCost;k.wasteKg+=x.industrialKg+x.hazardousKg;k.revenue+=x.scrapRevenue}
 el('opsYearRows').innerHTML=Object.values(yrs).sort((a,b)=>a.y.localeCompare(b.y)).map(x=>'<tr>'+[x.y,money(x.waste),money(x.water),money(x.waterCost),x.water&&x.waterCost?money(x.waterCost/x.water):'—',money(x.wasteCost),x.wasteKg?money(x.wasteCost/x.wasteKg):'—',money(x.revenue)].map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>').join('');
 el('opsReferenceRows').innerHTML=operations.filter(x=>['waste_detail_reference','scrap_detail_reference','monthly_reference'].includes(x.kind)).slice(0,500).map(x=>'<tr>'+[x.sourceSheet,x.date,x.name,x.code,money(x.quantity),x.unit,money(x.amount),x.note].map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>').join('');
 el('opsDataCount').textContent='Đã đọc '+operations.length+' bản ghi nghiệp vụ (giới hạn hiển thị tối đa 5.000 dòng; cần tải theo kỳ nếu dữ liệu nhiều năm).';
}
export async function loadOperations(){
 if(!db||!role)return [];
 try{
  const snap=await getDocs(query(collection(db,'operations'),limit(5000)));
  operations=snap.docs.map(d=>({...d.data(),id:d.id})).filter(x=>!validateOperation(x));
  report();return operations;
 }catch(e){notify('Không tải được dữ liệu nghiệp vụ: '+e.message);return []}
}
export function getOperationalRecords(){
 return operations.filter(x=>['waste','water_in','water_out','stock_in','stock_out'].includes(x.kind)).map(x=>({
  date:x.date,kind:x.kind,value:x.quantity,unit:x.unit,name:x.name||'',note:x.note||'',source:'operations'
 }));
}
export function mountOperations(database,actor,actorRole,onUpdate){
 db=database;user=actor;role=actorRole;refreshFn=onUpdate;
 const host=el('opsMount');
 if(!host)return;
 host.innerHTML='<div class="panel"><h2>Nhập tay & nhập Excel theo cấu trúc gốc</h2>'+
  '<p class="muted">Nhận diện A.1, A.2, 入库, 出库, A.3 phụ chi phí và báo cáo thu chi rác. Dữ liệu Excel được kiểm tra trước khi ghi. Chọn năm báo cáo đúng với nội dung các sheet tổng hợp.</p>'+
  '<div class="controls"><label>File Excel gốc<input id="opsFile" type="file" accept=".xlsx,.xls"></label>'+
  '<label>Năm cho sheet báo cáo tháng<input id="opsYear" type="number" min="2015" max="2100" value="2026"></label>'+
  '<button id="opsParse">Đọc và kiểm tra Excel</button></div>'+
  '<p id="opsSheetInfo" class="muted"></p><hr><h3>Nhập dữ liệu thủ công</h3>'+
  '<div class="controls"><label>Loại nhập<select id="opsKind">'+Object.entries(kinds).filter(([k])=>k!=='monthly_reference').map(([k,v])=>'<option value="'+k+'">'+safe(v)+'</option>').join('')+'</select></label></div>'+
  '<div class="controls" id="opsManualFields"></div><button class="primary" id="opsAddManual">Thêm vào danh sách chờ lưu</button>'+
  '<hr><h3>Kiểm tra & chỉnh sửa trước khi lưu</h3>'+
  '<p id="opsPreviewCount"></p><div id="opsWarnings" class="notice"></div>'+
  '<div class="scroll"><table><thead><tr><th>Bỏ</th><th>Nguồn</th><th>Ngày</th><th>Nghiệp vụ</th><th>Tên</th><th>Số lượng</th><th>Đơn vị</th><th>Mã</th><th>Kiểm tra</th></tr></thead><tbody id="opsPreviewRows"></tbody></table></div>'+
  '<div class="controls" style="margin-top:12px"><button id="opsPrev">100 dòng trước</button><button id="opsNext">100 dòng tiếp</button><button class="primary" id="opsSave">Lưu hàng loạt vào Firestore</button></div>'+
  '<p class="notice" id="opsMessage" role="status" aria-live="polite">Chưa có file Excel nào được đọc.</p></div>';
 const reportHost=el('opsReport');
 if(reportHost)reportHost.innerHTML='<div class="panel" style="margin-top:18px"><h2>Báo cáo nghiệp vụ từ file Excel</h2>'+
  '<p class="muted">Tổng hợp từ các dòng đã lưu. Chi phí xử lý nước thải chỉ sử dụng sheet A.3 phụ, không cộng trùng với giá trị nhập kho. Tồn kho tính từ giao dịch nhập/xuất, chưa cộng số dư đầu kỳ của sheet 收发存.</p><p id="opsDataCount"></p>'+
  '<div class="controls"><button id="opsExportAll">Xuất dữ liệu nghiệp vụ (CSV)</button><button id="opsExportMonth">Xuất báo cáo tháng (Excel)</button></div>'+
  '<h3>Thống kê tháng</h3><div class="scroll"><table><thead><tr><th>Tháng</th><th>Rác A.1 (kg)</th><th>XLNT (m³)</th><th>Xả (m³)</th><th>Phiếu nhập kho</th><th>Phiếu xuất kho</th><th>Chi phí XLNT</th><th>Chi phí/m³</th><th>Chi phí rác</th><th>Chi phí/kg rác</th><th>Thu phế liệu</th></tr></thead><tbody id="opsMonthlyRows"></tbody></table></div>'+
  '<h3>So sánh theo năm</h3><div class="scroll"><table><thead><tr><th>Năm</th><th>Rác (kg)</th><th>Nước xả (m³)</th><th>Chi phí XLNT</th><th>Chi phí/m³</th><th>Chi phí rác</th><th>Chi phí/kg rác</th><th>Thu phế liệu</th></tr></thead><tbody id="opsYearRows"></tbody></table></div>'+
  '<h3>Nhập – xuất – tồn theo mã vật tư</h3><div class="scroll"><table><thead><tr><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th>Tồn đầu</th><th>SL nhập</th><th>SL xuất</th><th>Tồn cuối</th><th>Giá trị nhập</th></tr></thead><tbody id="opsInventoryRows"></tbody></table></div></div>';
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
  const tables=[['opsMonthlyRows','Bao cao thang'],['opsYearRows','Tong hop nam'],['opsInventoryRows','Nhap xuat ton'],['opsReferenceRows','Tham chieu goc']];
  for(const [id,name] of tables){const table=el(id).closest('table'),array=[...table.rows].map(row=>[...row.cells].map(c=>c.textContent));window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet(array),name)}
  const cols=['date','kind','code','name','nameZh','group','quantity','unit','meter','previous','spec','worker','price','amount','note','sourceFile','sourceSheet','sourceRow'];
  const raw=[cols,...operations.map(r=>cols.map(k=>r[k]??''))];
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet(raw),'Du lieu chi tiet');
  window.XLSX.writeFile(wb,'EHS_bao_cao_quan_tri.xlsx');
 };
 paint();report();
}
