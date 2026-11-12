// Reconcile management totals with itemized expenses; never sum both sources.
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const month=x=>String(x.date||'').slice(0,7);
const stamp=x=>x.createdAt?.seconds||0;
function distinct(rows){
 const out=new Map();
 for(const x of rows){
  const key=[x.kind,x.date,x.name,x.sourceFile,x.sourceSheet,x.sourceRow,x.group].join('|');
  const previous=out.get(key);
  if(!previous||stamp(x)>stamp(previous))out.set(key,x);
 }
 return [...out.values()];
}
function recent(rows){
 if(!rows.length)return [];
 const newest=rows.reduce((a,x)=>stamp(x)>stamp(a)?x:a,rows[0]);
 return rows.filter(x=>x.importId===newest.importId);
}
const setByName=(rows,name)=>rows.filter(x=>x.name===name);
const value=(rows,name)=>num(setByName(rows,name).at(-1)?.quantity);
function preferred(rows,key){
 const candidates=rows.filter(r=>r.name===key).sort((a,b)=>stamp(a)-stamp(b));
 return candidates.length?Math.abs(Number(candidates.at(-1).quantity)):null;
}
export function reconcile(rows,from='1900-01-01',to='2100-12-31'){
 const legacy=rows.filter(x=>x.kind==='monthly_master'&&x.spec!=='master-map-v2'&&x.date>=from&&x.date<=to);
 // Previous importer skipped Excel's first blank row. Its labels must not enter official figures.
 const filtered=distinct(rows.filter(x=>x.date>=from&&x.date<=to&&!(x.kind==='monthly_master'&&x.spec!=='master-map-v2')));
 const months=[...new Set(filtered.map(month))].filter(Boolean).sort();
 const result=[],issues=[];
 for(const m of months){
  const at=filtered.filter(x=>month(x)===m);
  const master=at.filter(x=>x.kind==='monthly_master');
  const wtotal=at.filter(x=>x.kind==='water_cost_total').sort((a,b)=>stamp(a)-stamp(b)).at(-1)||null;
  const gtotal=at.filter(x=>x.kind==='green_cost_total').sort((a,b)=>stamp(a)-stamp(b)).at(-1)||null;
  const waterFull=at.filter(x=>x.kind==='water_cost_month'&&x.group==='water_cost_full');
  const waterOther=at.filter(x=>x.kind==='water_cost_month'&&x.group!=='water_cost_full');
  const waterLines=recent(wtotal?waterFull.filter(x=>x.importId===wtotal.importId):waterFull.length?waterFull:waterOther);
  const greenLines=recent(gtotal?at.filter(x=>x.kind==='green_cost_detail'&&x.importId===gtotal.importId):at.filter(x=>x.kind==='green_cost_detail'));
  const detailW=waterLines.reduce((a,x)=>a+num(x.quantity),0);
  const detailG=greenLines.reduce((a,x)=>a+num(x.quantity),0);
  const officialWater=wtotal?num(wtotal.quantity):waterLines.length?detailW:null;
  const officialGreen=gtotal?num(gtotal.quantity):greenLines.length?detailG:null;
  if(wtotal&&waterLines.length&&Math.abs(num(wtotal.quantity)-detailW)>1)issues.push({month:m,type:'water_cost',actual:num(wtotal.quantity),detail:detailW,difference:num(wtotal.quantity)-detailW});
  if(gtotal&&greenLines.length&&Math.abs(num(gtotal.quantity)-detailG)>1)issues.push({month:m,type:'green_cost',actual:num(gtotal.quantity),detail:detailG,difference:num(gtotal.quantity)-detailG});
  const fallback=at.filter(x=>x.kind==='waste_finance_month');
  const pick=(k)=>preferred(master,k)??preferred(fallback,k);
  const daily=(k)=>at.filter(x=>x.kind===k).reduce((a,x)=>a+num(x.quantity),0);
  const waterIn=pick('water_in')??daily('water_in');
  const waterOut=pick('water_out')??daily('water_out');
  const industrialKg=pick('industrial_waste_kg');
  const hazardousKg=pick('hazardous_waste_kg');
  const domesticKg=pick('domestic_waste_kg_approx');
  const industrialCost=pick('industrial_cost');
  const hazardousCost=pick('hazardous_cost');
  const domesticCost=pick('domestic_cost');
  const revenue=pick('scrap_revenue');
  const totalWasteCost=[industrialCost,hazardousCost,domesticCost].every(v=>v===null)?null:num(industrialCost)+num(hazardousCost)+num(domesticCost);
  const wasteNet=totalWasteCost===null&&revenue===null?null:num(revenue)-num(totalWasteCost);
  const eligibleKg=num(industrialKg)+num(hazardousKg)+num(domesticKg);
  result.push({
   month:m,wasteKg:daily('waste'),waterIn,waterOut,industrialKg,hazardousKg,domesticKg,
   recyclableKg:pick('recyclable_kg'),
   industrialCost,hazardousCost,domesticCost,revenue,wasteNet,
   waterCost:officialWater,greenCost:officialGreen,
   wasteCost:totalWasteCost,
   costWaterPerM3:waterOut>0&&officialWater!==null?officialWater/waterOut:null,
   costWastePerKg:eligibleKg>0&&totalWasteCost!==null?totalWasteCost/eligibleKg:null,
   stockIn:at.filter(x=>x.kind==='stock_in').length,
   stockOut:at.filter(x=>x.kind==='stock_out').length,
   waterDetailSum:waterLines.length?detailW:null,
   greenDetailSum:greenLines.length?detailG:null,
   waterSource:wtotal?'A.3 tổng chính thức':waterLines.length?'A.3 chi tiết':'Chưa nhập A.3',
   wasteSource:master.length?'A.TK tổng hợp':'Chưa có A.TK',
   greenSource:gtotal?'C tổng chính thức':greenLines.length?'C chi tiết':'Chưa nhập C'
  });
 }
 return {months:result,issues,legacyCount:legacy.length,waterDetails:filtered.filter(x=>x.kind==='water_cost_month'),greenDetails:filtered.filter(x=>x.kind==='green_cost_detail'),raw:filtered};
}
