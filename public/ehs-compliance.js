import {collection,addDoc,getDocs,query,limit,serverTimestamp}
from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const num=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
let db=null,user=null,role=null,getOps=()=>[],ghg=[],ready=false;
const classified=name=>{
 const s=String(name||'').toLowerCase();
 if(/pac|polyaluminium|poly aluminum|poly aluminium/.test(s))return 'PAC – keo tụ';
 if(/naoh|xút|sodium hydroxide/.test(s))return 'NaOH – kiềm';
 if(/polymer|polime/.test(s))return 'Polymer – trợ lắng';
 if(/phân bón|肥料|dap 18|n(p|pk)|vka|urê|urea|phân hữu|npk/i.test(s))return 'Phân bón';
 if(/thuốc trừ sâu|農藥|domosph|diệt cỏ|trừ sâu|pesticide/i.test(s))return 'Thuốc BVTV';
 if(/vôi|lime|hcl|acid|axit|hoá chất|hóa chất/i.test(s))return 'Hóa chất khác';
 return 'Khác / chưa phân loại';
};
function table(headers,rows){
 return '<div class="scroll"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
 (rows.length?rows.map(a=>'<tr>'+a.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">Chưa có dữ liệu / nguồn chứng từ phù hợp.</td></tr>')+'</tbody></table></div>';
}
const sum=(array)=>array.reduce((acc,x)=>acc+Number(x.quantity||0),0);
function selectedPeriod(ops){
 const from=$('from')?.value||'1900-01-01',to=$('to')?.value||'2100-12-31';
 return ops.filter(x=>x.date>=from&&x.date<=to);
}
function chemical(ops){
 const map=new Map();
 for(const x of ops.filter(x=>['stock_in','stock_out'].includes(x.kind))){
  const group=classified(x.name),key=[group,x.code||x.name,x.unit].join('|');
  const item=map.get(key)||{group,code:x.code||'',name:x.name||'',unit:x.unit||'',in:0,out:0,amount:0};
  if(x.kind==='stock_in'){item.in+=Number(x.quantity);item.amount+=Number(x.amount||0)}
  else item.out+=Number(x.quantity);
  map.set(key,item);
 }
 return [...map.values()].sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name));
}
async function loadGHG(){
 if(!db||!user||!role)return;
 try{
  const result=await getDocs(query(collection(db,'ghg_activities'),limit(1500)));
  ghg=result.docs.map(d=>({id:d.id,...d.data()}));
  ready=true;render();
 }catch(e){$('ghgStatus').textContent='Không tải được dữ liệu kiểm kê: '+e.message}
}
function render(){
 if(!$('complianceContent'))return;
 const ops=selectedPeriod(getOps());
 const rows=chemical(ops);
 const waste=ops.filter(x=>x.kind==='waste'),hazardous=waste.filter(x=>x.group==='hazardous');
 const out=ops.filter(x=>x.kind==='water_out').reduce((a,x)=>a+Number(x.quantity||0),0);
 const inn=ops.filter(x=>x.kind==='water_in').reduce((a,x)=>a+Number(x.quantity||0),0);
 const stock=ops.filter(x=>x.kind==='stock_out');
 const fertilizer=rows.filter(x=>x.group==='Phân bón');
 const chemicalGroups=rows.filter(x=>x.group!=='Khác / chưa phân loại');
 const baseRows=[
 ['Lượng rác thu gom (kg)',num(sum(waste)),'Đo từ A.1; chưa tương đương đầy đủ chất thải phát sinh GRI 306-3'],
 ['Rác được ghi nhóm nguy hại (kg)',num(sum(hazardous)),'Chỉ gồm dòng có phân loại xác nhận; loại chưa phân loại không tự tính là không nguy hại'],
 ['Nước xử lý đầu vào (m³)',num(inn),'Nước vào trạm XLNT, KHÔNG phải tổng nước khai thác GRI 303-3'],
 ['Nước thải đầu ra (m³)',num(out),'Dữ liệu XLNT; cần bổ sung điểm xả, chất lượng nước, nguồn tiếp nhận'],
 ['Dòng xuất vật tư',String(stock.length),'Dùng vật tư theo mã và đơn vị; không cộng lẫn kg, chai và bao'],
 ['Nhóm phân bón',String(fertilizer.length),'Phân loại sơ bộ theo tên vật tư; cần xác nhận hàm lượng N và quy đổi đơn vị']
 ];
 const groupRows=new Map();
 for(const r of chemicalGroups){
  const key=r.group+'|'+r.unit,g=groupRows.get(key)||{group:r.group,unit:r.unit,in:0,out:0,amount:0};
  g.in+=r.in;g.out+=r.out;g.amount+=r.amount;groupRows.set(key,g);
 }
 const from=$('from')?.value||'1900-01-01',to=$('to')?.value||'2100-12-31';
 const activity=ghg.filter(x=>x.date>=from&&x.date<=to);
 const byScope={'1':{activity:0,complete:0,t:0},'2':{activity:0,complete:0,t:0},'3':{activity:0,complete:0,t:0}};
 for(const x of activity){
  const g=byScope[String(x.scope)];if(!g)continue;
  g.activity++;
  if(Number.isFinite(x.factor)&&x.factor>=0&&x.factorSource&&x.factorYear){
   g.t+=(Number(x.quantity)*Number(x.factor))/1000;g.complete++;
  }
 }
 const calculated=activity.filter(x=>Number.isFinite(x.factor)&&x.factor>=0&&x.factorSource&&x.factorYear).length;
 $('complianceContent').innerHTML='<div class="stats">'+[
  ['Lượng rác thu gom',num(sum(waste))+' kg'],['Nước vào XLNT',num(inn)+' m³'],['Nước xả XLNT',num(out)+' m³'],['Dòng xuất kho',String(stock.length)]
 ].map(([k,v])=>'<div class="stat">'+esc(k)+'<strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
 '<div class="panel"><h3>Chỉ số giám sát môi trường & nguồn dữ liệu</h3>'+
 table(['Chỉ tiêu','Giá trị','Giới hạn và giải trình'],baseRows)+
 '<p class="muted">Tham chiếu GRI 303/306 và ISO 14064-1; đây chưa phải báo cáo được chứng nhận hoặc đảm bảo độc lập.</p></div>'+
 '<div class="panel"><h3>Kiểm soát hóa chất, vật tư và phân bón theo loại</h3>'+
 table(['Nhóm','Đơn vị','Nhập','Xuất / sử dụng','Giá trị nhập (VND)'],
 [...groupRows.values()].map(x=>[x.group,x.unit,num(x.in),num(x.out),num(x.amount)]))+
 '<h4>Chi tiết vật tư theo mã</h4>'+table(['Nhóm','Mã','Tên','ĐVT','Nhập','Xuất','Giá trị nhập'],
  rows.map(x=>[x.group,x.code,x.name,x.unit,num(x.in),num(x.out),num(x.amount)]))+
 '<p class="muted">Không cộng các vật tư khác đơn vị hoặc suy ra lượng hóa chất tiêu thụ từ số lượng mua. Cần thêm: tồn thực kiểm, lô/hạn dùng, SDS, giới hạn lưu kho, nhà cung cấp, mã chất thải nguy hại.</p></div>'+
 '<div class="panel"><h3>Kiểm kê khí nhà kính – ISO 14064-1 / GHG Protocol</h3>'+
 '<p>Giá trị kiểm kê là <b>tCO₂e = số lượng hoạt động × hệ số kgCO₂e/đơn vị ÷ 1.000</b>. Hệ số do người dùng cung cấp và phải dẫn nguồn, năm áp dụng. Nếu không có hệ số, hiển thị thiếu dữ liệu chứ không tự ước tính.</p>'+
 table(['Phạm vi','Nguồn hoạt động','Có hệ số hợp lệ','Ước tính có thể tính (tCO₂e)'],
 Object.entries(byScope).map(([scope,x])=>['Scope '+scope,x.activity,x.complete,x.complete?num(x.t):'Chưa đủ dữ liệu']))+
 '<p class="muted">Có '+calculated+'/'+activity.length+' dòng hoạt động có hệ số và nguồn. Tổng Scope không thể coi là hoàn chỉnh nếu có nguồn chưa khai báo hoặc thiếu hệ số. Phân bón có thể liên quan N₂O nhưng phải có phương pháp và dữ liệu N riêng.</p>'+
 table(['Ngày','Scope','Nguồn phát thải','Lượng','ĐVT','Hệ số (kgCO₂e/đv)','Năm EF','Nguồn hệ số','Ước tính tCO₂e'],
 activity.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,200).map(x=>[
 x.date,'Scope '+x.scope,x.activity,num(x.quantity),x.unit,x.factor===null?'—':num(x.factor),
 x.factorYear||'—',x.factorSource||'Chưa có',Number.isFinite(x.factor)&&x.factorSource&&x.factorYear?num(x.quantity*x.factor/1000):'Chưa đủ nguồn'
 ]))+'</div>'+
 '<div class="panel"><h3>Các nguồn dữ liệu còn cần để báo cáo chuẩn</h3>'+
 table(['Bộ tiêu chí','Dữ liệu còn thiếu','Trạng thái'],[
 ['GRI 306-3/4/5','Mã chất thải, nguy hại, cân thực tế, tái chế / tái sử dụng / chôn lấp / đốt, chứng từ bàn giao','Chưa đủ'],
 ['GRI 303','Nước khai thác theo nguồn, nước tiêu thụ, khu vực stress nước, COD/BOD/TSS, giấy phép, vị trí xả','Chưa đủ'],
 ['GRI 301 / tồn kho','Phân loại tái tạo, độ chính xác kiểm kê kho, lô, hạn dùng, phiếu kiểm kê, tồn tối thiểu','Một phần'],
 ['ISO 14064-1 / GHG Protocol','Ranh giới tổ chức, năm cơ sở, nhiên liệu, điện năng kWh, khí lạnh, hệ số phát thải, phương pháp, Scope 3 được chọn','Chưa đủ'],
 ['Phân bón và hóa chất','Hàm lượng N, lượng thực dùng theo loại, hoạt chất, SDS, tồn kho từng kho, hạn dùng, an toàn xử lý','Một phần'],
 ['Kiểm soát tài chính','Ngân sách, chênh lệch thực tế–ngân sách, hóa đơn, chứng từ, chi phí trên đơn vị sản lượng','Chưa đủ']
 ])+'</div>';
}
async function addActivity(e){
 e.preventDefault();
 if(!db||!user||!['admin','editor'].includes(role))return;
 const form=$('ghgForm'),qty=Number(form.elements.quantity.value),rawFactor=form.elements.factor.value.trim();
 const factor=rawFactor===''?null:Number(rawFactor);
 const year=form.elements.factorYear.value.trim(),source=form.elements.factorSource.value.trim();
 if(!form.elements.activity.value.trim()||!form.elements.unit.value.trim()||!Number.isFinite(qty)||qty<0)return alert('Hãy kiểm tra nguồn, đơn vị và số lượng.');
 if(factor!==null&&(!Number.isFinite(factor)||factor<0||!source||!/^\d{4}$/.test(year)))return alert('Nếu nhập hệ số phát thải, bắt buộc ghi nguồn và năm EF.');
 try{
  await addDoc(collection(db,'ghg_activities'),{
   date:form.elements.date.value,scope:String(form.elements.scope.value),
   activity:form.elements.activity.value.trim(),quantity:qty,
   unit:form.elements.unit.value.trim(),factor, factorYear:year,factorSource:source,
   createdBy:user.uid,createdAt:serverTimestamp()
  });
  form.reset();form.elements.date.value=new Date().toISOString().slice(0,10);
  $('ghgStatus').textContent='Đã lưu hoạt động. Hệ số không có nguồn sẽ không được chấp nhận để tính.';
  await loadGHG();
 }catch(err){$('ghgStatus').textContent='Không lưu được: '+err.message}
}
export function initCompliance(){
 $('ghgForm').onsubmit=addActivity;
 $('from')?.addEventListener('change',render);$('to')?.addEventListener('change',render);
}
export function refreshCompliance(){if(ready)render()}
export async function mountCompliance(database,actor,actorRole,fetchOperations){
 db=database;user=actor;role=actorRole;getOps=fetchOperations||(()=>[]);
 $('ghgForm').hidden=!user||!['admin','editor'].includes(role);
 if(!user||!role){ghg=[];ready=false;$('complianceContent').innerHTML='<div class="panel">Đăng nhập để xem các chỉ số EHS.</div>';return}
 await loadGHG();
}
