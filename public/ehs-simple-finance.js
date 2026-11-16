import {reconcile} from './ehs-financial-reconcile.js?v=20261116finance';
const $=id=>document.getElementById(id);
const fmt=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:0});
const money=n=>fmt(n)+' VND';
let all=[];
const num=n=>Number.isFinite(Number(n))?Number(n):0;
const sum=(rows,key)=>rows.reduce((a,r)=>a+num(r[key]),0);
function build(){
 const year=$('simpleFinanceYear')?.value||'';
 const calc=reconcile(all,year+'-01-01',year+'-12-31');
 const months=calc.months.filter(x=>x.month.startsWith(year));
 const month=$('simpleFinanceMonth')?.value||'all';
 const selected=months.filter(x=>month==='all'||x.month.slice(5,7)===month);
 const rows=selected.map(x=>{
  const stock=all.filter(r=>r.kind==='stock_in'&&String(r.date||'').slice(0,7)===x.month);
  const buy=stock.reduce((a,r)=>a+(Number.isFinite(Number(r.amount))?Number(r.amount):num(r.quantity)*num(r.price)),0);
  const costs=[x.waterCost,x.greenCost,x.wasteCost],has=costs.some(v=>v!==null);
  const operating=has?costs.reduce((a,v)=>a+num(v),0):null;
  return {month:x.month,water:x.waterCost,green:x.greenCost,waste:x.wasteCost,purchase:stock.length?buy:null,
   revenue:x.revenue,operating,balance:operating!==null&&x.revenue!==null?num(x.revenue)-operating:null};
 });
 const values=key=>rows.map(r=>r[key]).filter(v=>v!==null&&v!==undefined);
 const total=key=>{const v=values(key);return v.length?v.reduce((a,b)=>a+num(b),0):null};
 const show=(id,v)=>{const el=$(id);if(el)el.textContent=money(v)};
 show('simpleFinanceExpense',total('operating'));show('simpleFinanceIncome',total('revenue'));
 show('simpleFinanceBalance',total('balance'));show('simpleFinancePurchase',total('purchase'));
 const body=$('simpleFinanceRows');
 if(body){
  body.innerHTML=rows.map(r=>'<tr>'+[r.month,r.water,r.green,r.waste,r.operating,r.revenue,r.balance,r.purchase]
   .map((v,i)=>'<td>'+(i===0?v:fmt(v))+'</td>').join('')+'</tr>').join('')+
   '<tr class="ehs-finance-total"><td>TỔNG CỘNG</td>'+['water','green','waste','operating','revenue','balance','purchase'].map(k=>'<td>'+fmt(total(k))+'</td>').join('')+'</tr>';
 }
 const status=$('simpleFinanceStatus');
 if(status)status.textContent='Chi phí vận hành = XLNT + Cây xanh + Rác thải. Giá trị nhập vật tư được trình bày riêng vì có thể đã nằm trong chi phí sử dụng, không cộng hai lần. Chỉ tính từ số liệu đã ghi nhận.';
 return rows;
}
function years(){
 const el=$('simpleFinanceYear');if(!el)return;
 const values=[...new Set(all.map(x=>String(x.date||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
 const prev=el.value||$('from')?.value.slice(0,4);
 el.innerHTML=values.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
 el.value=values.includes(prev)?prev:(values[0]||'');
 const months=$('simpleFinanceMonth'),old=months.value;
 months.innerHTML='<option value="all">Cả năm</option>'+Array.from({length:12},(_,i)=>'<option value="'+String(i+1).padStart(2,'0')+'">Tháng '+(i+1)+'</option>').join('');
 months.value=old||'all';
}
function exportFinance(){
 if(!window.XLSX)return alert('Công cụ Excel chưa tải.');
 const result=build(),book=window.XLSX.utils.book_new();
 const data=result.map(x=>({'Tháng':x.month,'Chi phí XLNT VND':x.water,'Chi phí cây xanh VND':x.green,
 'Chi phí rác VND':x.waste,'Tổng chi vận hành VND':x.operating,'Thu phế liệu VND':x.revenue,
 'Chênh lệch thu-chi VND':x.balance,'Giá trị nhập vật tư VND (theo dõi riêng)':x.purchase}));
 const ws=window.XLSX.utils.json_to_sheet(data);ws['!cols']=[{wch:14},...Array(7).fill({wch:24})];
 window.XLSX.utils.book_append_sheet(book,ws,'Tai chinh EHS');
 window.XLSX.writeFile(book,'EHS_Tai_chinh_'+$('simpleFinanceYear').value+'.xlsx');
}
export function initSimpleFinance(){
 const host=$('simpleFinanceMount');if(!host)return;
 host.innerHTML='<div class="ehs-finance-overview"><div class="ehs-finance-head"><div><h2>Báo cáo tài chính EHS</h2><p class="muted">Tổng hợp thu · chi vận hành theo tháng, không cộng trùng nhập kho với sử dụng vật tư.</p></div>'+
 '<div class="ehs-finance-actions"><label>Năm<select id="simpleFinanceYear"></select></label><label>Tháng<select id="simpleFinanceMonth"><option value="all">Cả năm</option></select></label><button id="simpleFinanceExport" class="primary">Xuất Excel</button></div></div>'+
 '<div class="ehs-finance-kpis"><div><span>Tổng chi vận hành</span><strong id="simpleFinanceExpense">—</strong></div><div><span>Thu phế liệu</span><strong id="simpleFinanceIncome">—</strong></div><div><span>Chênh lệch thu – chi</span><strong id="simpleFinanceBalance">—</strong></div><div><span>Giá trị nhập vật tư (theo dõi riêng)</span><strong id="simpleFinancePurchase">—</strong></div></div>'+
 '<div class="scroll"><table class="ehs-finance-table"><thead><tr><th>Tháng</th><th>Nước thải</th><th>Cây xanh</th><th>Rác</th><th>Tổng chi</th><th>Thu</th><th>Chênh lệch</th><th>Giá trị nhập kho*</th></tr></thead><tbody id="simpleFinanceRows"></tbody></table></div>'+
 '<p class="muted" id="simpleFinanceStatus"></p></div>';
 $('simpleFinanceYear').onchange=build;$('simpleFinanceMonth').onchange=build;
 $('simpleFinanceExport').onclick=exportFinance;years();build();
}
export function setSimpleFinanceRecords(rows){all=Array.isArray(rows)?rows.slice():[];if($('simpleFinanceYear')){years();build()}}
