// EHS Excel adapters: maps real source workbook sheets, preserving provenance and units.
// No source workbook data or private documents are bundled into the website.
const str=v=>String(v??'').trim();
const number=v=>{
 if(typeof v==='number')return Number.isFinite(v)?v:NaN;
 const s=str(v).replace(/\s/g,''); if(!s)return NaN;
 if(s.includes(',')&&s.includes('.'))return Number(s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,''));
 if(/^-?\d{1,3}(,\d{3})+$/.test(s))return Number(s.replace(/,/g,''));
 if(/^-?\d{1,3}(\.\d{3})+$/.test(s))return Number(s.replace(/\./g,''));
 return Number(s.replace(',','.'));
};
export function asDay(v){
 if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
 if(typeof v==='number'&&v>20000&&window.XLSX?.SSF){
  const d=window.XLSX.SSF.parse_date_code(v);
  if(d)return [d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');
 }
 const s=str(v);
 if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
 const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
 if(m){let a=Number(m[1]),b=Number(m[2]);if(a>12)return [m[3],String(b).padStart(2,'0'),String(a).padStart(2,'0')].join('-');return [m[3],String(a).padStart(2,'0'),String(b).padStart(2,'0')].join('-');}
 return '';
}
const row=(kind,date,quantity,more={})=>({kind,date,quantity:Number(quantity),unit:more.unit||'',name:more.name||'',code:more.code||'',spec:more.spec||'',worker:more.worker||'',note:more.note||'',price:Number.isFinite(more.price)?more.price:null,amount:Number.isFinite(more.amount)?more.amount:null,previous:Number.isFinite(more.previous)?more.previous:null,meter:Number.isFinite(more.meter)?more.meter:null,group:more.group||'',nameZh:more.nameZh||'',sourceSheet:more.sourceSheet||'',sourceRow:more.sourceRow||0,sourceFile:more.sourceFile||'',year:more.year||0});
const groupForWaste=s=>/有害|nguy hại|TPNH|Bùn thải|污泥/i.test(s)?'hazardous':/工業|công nghiệp/i.test(s)?'industrial':/giấy|carton|pallet|gỗ|phế liệu|nylon/i.test(s)?'recyclable':'other';
function add(out,kind,date,qty,more){
 const n=number(qty);if(!date||!Number.isFinite(n)||n<0)return;
 out.push(row(kind,date,n,more));
}
export function detectSheet(name){
 const s=str(name).toLowerCase();
 if(/^a\.1\s/i.test(s))return 'waste';
 if(/^a\.2\s/i.test(s))return 'water';
 if(s.includes('收发存'))return 'stock_opening';
 if(s.includes('入库'))return 'stock_in';
 if(s.includes('出库'))return 'stock_out';
 if(s.includes('a.3 chi phí nước thải')||s.includes('a.3 chi phi nuoc thai'))return 'water_cost_full';
 if(s.includes('a.3 phu')||s.includes('a.3 phu')||s.includes('phu bi')||s.includes('phụ biểu'))return 'water_cost';
 if(s.includes('rác nh_cn&sh'))return 'waste_detail_reference';
 if(s.includes('pl _廢品'))return 'scrap_detail_reference';
 if(s.includes('bảng thu chi hàng tháng')||s.includes('每月收支表'))return 'waste_finance';
 if(s.includes('a.tk rác_xlnt'))return 'monthly_reference';
 return null;
}
export function parseWorkbook(book,fileName,reportYear){
 const items=[],summaries=[],found=[],warnings=[];
 const year=Number(reportYear)||new Date().getFullYear();
 const hasMainCost=book.SheetNames.some(s=>detectSheet(s)==='water_cost_full');
 const sheetRows=s=>window.XLSX.utils.sheet_to_json(s,{header:1,defval:null,raw:true,blankrows:false});
 for(const sheetName of book.SheetNames){
  const type=detectSheet(sheetName);if(!type)continue;
  const matrix=sheetRows(book.Sheets[sheetName]); found.push({sheet:sheetName,type,count:matrix.length});
  const source={sourceSheet:sheetName,sourceFile:fileName,year};
  if(type==='waste'){
   matrix.forEach((r,i)=>{if(i===0)return;const d=asDay(r[0]);add(items,'waste',d,r[3],{...source,sourceRow:i+1,unit:'kg',name:str(r[1]),nameZh:str(r[2]),group:groupForWaste(str(r[1])+' '+str(r[2]))})});
  }else if(type==='water'){
   matrix.forEach((r,i)=>{
    if(i===0)return;const d=asDay(r[0]);if(!d)return;
    const meterIn=number(r[1]),previousIn=number(r[2]),meterOut=number(r[3]),previousOut=number(r[4]);
    let treated=number(r[5]),discharged=number(r[6]);
    if(!Number.isFinite(treated)&&Number.isFinite(meterIn)&&Number.isFinite(previousIn))treated=meterIn-previousIn;
    if(!Number.isFinite(discharged)&&Number.isFinite(meterOut)&&Number.isFinite(previousOut))discharged=meterOut-previousOut;
    add(items,'water_in',d,treated,{...source,sourceRow:i+1,unit:'m³',meter:meterIn,previous:previousIn,note:str(r[7])});
    add(items,'water_out',d,discharged,{...source,sourceRow:i+1,unit:'m³',meter:meterOut,previous:previousOut,note:str(r[7])});
    if((Number.isFinite(meterIn)&&Number.isFinite(previousIn)&&meterIn<previousIn)||(Number.isFinite(meterOut)&&Number.isFinite(previousOut)&&meterOut<previousOut))warnings.push(sheetName+' dòng '+(i+1)+': đồng hồ nhỏ hơn lần trước, cần kiểm tra.');
    if(Number.isFinite(meterIn)&&Number.isFinite(previousIn)&&Number.isFinite(treated)&&Math.abs(treated-(meterIn-previousIn))>0.001)warnings.push(sheetName+' dòng '+(i+1)+': lượng xử lý khác hiệu số đồng hồ.');
    if(Number.isFinite(meterOut)&&Number.isFinite(previousOut)&&Number.isFinite(discharged)&&Math.abs(discharged-(meterOut-previousOut))>0.001)warnings.push(sheetName+' dòng '+(i+1)+': lượng xả khác hiệu số đồng hồ.');
   });
  }else if(type==='stock_opening'){
   // Inventory sheet 收发存 uses row 4 headers and initial balance for 2025 in column F.
   matrix.forEach((r,i)=>{if(i<5)return;add(summaries,'stock_opening','2025-01-01',r[5],{...source,sourceRow:i+1,code:str(r[1]),name:str(r[2]),spec:str(r[3]),unit:str(r[4]),note:'Số dư đầu kỳ 2025 từ 收发存 (không phải phiếu nhập kho)'})});
  }else if(type==='stock_in'){
   matrix.forEach((r,i)=>{
    if(i<3)return;const d=asDay(r[2]),qty=number(r[7]),price=number(r[10]),amount=number(r[11]);
    add(items,'stock_in',d,qty,{...source,sourceRow:i+1,code:str(r[3]),name:str(r[4]),spec:str(r[5]),unit:str(r[6]),worker:str(r[8]),note:str(r[9]),price,amount:Number.isFinite(amount)?amount:Number.isFinite(price)?price*qty:NaN});
    if(Number.isFinite(price)&&Number.isFinite(amount)&&Number.isFinite(qty)&&Math.abs(price*qty-amount)>1)warnings.push(sheetName+' dòng '+(i+1)+': đơn giá × số lượng khác thành tiền.');
   });
  }else if(type==='stock_out'){
   matrix.forEach((r,i)=>{if(i<2)return;add(items,'stock_out',asDay(r[1]),r[6],{...source,sourceRow:i+1,code:str(r[2]),name:str(r[3]),spec:str(r[4]),unit:str(r[5]),worker:str(r[7]),note:str(r[8])})});
  }else if(type==='waste_detail_reference'){
   matrix.forEach((r,i)=>{
    if(i<4||!str(r[2])||/tổng|總|更新/i.test(str(r[2])))return;
    const q=number(r[4]),c=number(r[5]);
    if(!Number.isFinite(q)&&!Number.isFinite(c))return;
    add(summaries,'waste_detail_reference',year+'-10-01',q,{...source,sourceRow:i+1,unit:'kg',name:str(r[2]),code:str(r[3]),amount:c,group:'cumulative',note:'Báo cáo lũy kế đến 10/'+year+'; không cộng vào A.1'});
   });
  }else if(type==='scrap_detail_reference'){
   matrix.forEach((r,i)=>{if(i<5||!str(r[2])||/tổng|總/i.test(str(r[2])))return;
    add(summaries,'scrap_detail_reference',year+'-10-01',r[3],{...source,sourceRow:i+1,unit:'kg',name:str(r[2]),amount:number(r[4]),group:'cumulative',note:'Thống kê phế liệu lũy kế đến 10/'+year+'; không cộng vào giao dịch A.1'});
   });
  }else if(type==='water_cost_full'){
   // Master A.3 cost sheet: columns G/H through AC/AD (quantity, VND) for 12 months.
   // Skip subtotal/total rows; the full expense detail is the authoritative monthly cost.
   matrix.forEach((r,i)=>{
    if(i<5||i>19)return;
    const name=str(r[0]),unit=str(r[1]),price=number(r[2]);
    if(!name||!Number.isFinite(price)||/tổng|總/i.test(name))return;
    for(let m=1;m<=12;m++){
     const consumed=number(r[6+2*(m-1)]),amount=number(r[7+2*(m-1)]);
     if(!Number.isFinite(amount)||amount<0)continue;
     add(summaries,'water_cost_month',year+'-'+String(m).padStart(2,'0')+'-01',amount,{
      ...source,sourceRow:i+1,unit:'VND',name,price,amount,
      note:'Chi phí A.3 chính; tiêu thụ '+(Number.isFinite(consumed)?consumed:'—')+' '+unit,
      group:'water_cost_full'
     });
    }
   });
  }else if(type==='water_cost'){
   // Cost appendix has twelve monthly amount columns (B:M), row 4 contains month labels.
   matrix.slice(4).forEach((r,j)=>{
    const name=str(r[0]);if(!name||/tổng|合計|total/i.test(name))return;
    for(let m=1;m<=12;m++)add(summaries,hasMainCost?'water_cost_reference':'water_cost_month',year+'-'+String(m).padStart(2,'0')+'-01',r[m],{...source,sourceRow:j+5,unit:'VND',name,group:'water_cost',note:'Báo cáo chi phí theo tháng; không tự cộng với giao dịch vật tư'});
   });
  }else if(type==='waste_finance'){
   const descriptors=[['industrial_waste_kg',4,'kg'],['industrial_cost',5,'VND'],['hazardous_waste_kg',6,'kg'],['hazardous_cost',7,'VND'],['recyclable_kg',8,'kg'],['scrap_revenue',9,'VND']];
   for(const [metric,ridx,unit] of descriptors){
    const vals=matrix[ridx]||[];
    for(let m=1;m<=12;m++)add(summaries,'waste_finance_month',year+'-'+String(m).padStart(2,'0')+'-01',vals[m+3],{...source,sourceRow:ridx+1,unit,name:metric,group:'waste_finance'});
   }
  }else if(type==='monthly_reference'){
   // Summary is kept separate to avoid counting it twice alongside A.1/A.2 transactions.
   matrix.slice(2).forEach((r,j)=>{const label=str(r[2]);if(!label)return;for(let m=1;m<=12;m++)add(summaries,'monthly_reference',year+'-'+String(m).padStart(2,'0')+'-01',r[m+2],{...source,sourceRow:j+3,name:label,unit:/m3|m³/i.test(label)?'m³':/kg/i.test(label)?'kg':'',group:'reference'})});
  }
 }
 if(!found.length)warnings.push('Không tìm thấy sheet A.1, A.2, 入库, 出库 hoặc các báo cáo hỗ trợ.');
 return {items:[...items,...summaries],found,warnings};
}
export function validateOperation(r){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||''))return 'Ngày không hợp lệ';
 if(!Number.isFinite(Number(r.quantity))||Number(r.quantity)<0)return 'Số lượng không hợp lệ';
 if(!r.kind)return 'Thiếu loại nghiệp vụ';
 if(String(r.name||'').length>300||String(r.note||'').length>1400)return 'Tên hoặc ghi chú quá dài';
 return '';
}
