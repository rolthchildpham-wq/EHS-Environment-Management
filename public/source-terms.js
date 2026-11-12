// Display translations only. The original Excel source values are immutable.
import {getLanguage} from './i18n.js?v=20261112f';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const enMap=[
 ['hoa chat naoh','Sodium hydroxide (NaOH)'],
 ['hoa chat keo tu pac','Polyaluminium chloride (PAC) coagulant'],
 ['polyme','Flocculant polymer'],
 ['bot mi','Flour (nutrient source)'],
 ['mat ri duong','Molasses'],
 ['dien nang tram bom','Pump/mixer electricity'],
 ['nuoc sach ve sinh','Clean water for cleaning and chemical preparation'],
 ['quan ly van hanh he thong','Wastewater system operations management'],
 ['chi phi ep bun','Sludge dewatering'],
 ['chi phi xu ly bun','Sludge treatment'],
 ['chi phi tiep nhan xa thai','Industrial park wastewater acceptance fee'],
 ['chi phi bao tri','Equipment maintenance'],
 ['thuoc tru sau anvil','Anvil 5SC pesticide'],
 ['dat sach','Clean planting soil'],
 ['thuoc tru sau domosphi','Domosphi 20EC insecticide'],
 ['phan huu co vka','VKA organic fertilizer'],
 ['dap','Diammonium phosphate (DAP) fertilizer'],
 ['dam','Nitrogen fertilizer'],
 ['phan bon vien nen','Compressed earthworm-castings fertilizer for bonsai'],
 ['diet co','Herbicide'],
 ['thuoc kich re','N3M root stimulant'],
 ['phan bon kich mam','Bud growth stimulant fertilizer'],
 ['nuoc tuoi cay','Irrigation water'],
 ['luong nhan cong','Landscaping maintenance labor'],
 ['cat canh tren cao','Periodic high-altitude tree pruning'],
 ['phan bon & vat tu','Fertilizers and care supplies'],
 ['hoa chat','Chemicals'],
 ['dien & nuoc','Electricity and water'],
 ['nhan cong','Labor'],
 ['bun thai','Waste sludge'],
 ['dich vu cham soc','Landscaping services'],
 ['bao tri','Maintenance'],
 ['phan bon','Fertilizers']
];
const gloss=new Map(enMap.map(([k,v])=>[k,v]));
const overrides=new Map();
const cache=new Map();
const missing=new Set();
const split=s=>{
 const lines=String(s||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 return {vi:lines[0]||'',zh:lines.slice(1).join(' ')};
};
export function displaySourceName(record,lang=getLanguage()){
 const src=split(record?.name||'');
 const vi=record?.nameVi||src.vi;
 const zh=record?.nameZh||src.zh;
 if(lang==='vi')return vi||src.vi;
 if(lang==='zh'&&zh)return zh;
 const key=normalize(vi);
 const override=overrides.get(lang+'|'+key);
 if(override)return override;
 const translated=cache.get(lang+'|'+key);
 if(translated)return translated;
 if(lang==='en'){
  const exact=gloss.get(key);if(exact)return exact;
  for(const [prefix,meaning] of gloss)if(key.startsWith(prefix))return meaning;
 }
 missing.add(vi);
 return '⚠ '+vi+' [chưa có bản dịch]';
}
export function sourceNameOriginal(record){return record?.name||''}
export function translationState(){return {missing:[...missing]}}
export function manualOverride(source,language,translated){
 const key=normalize(split(source).vi);
 if(!key||!translated.trim())return;
 overrides.set(language+'|'+key,translated.trim());
 missing.delete(split(source).vi);
}
export async function translateUnknownRecords(records,language){
 const TranslatorAPI=globalThis.Translator;
 if(!TranslatorAPI?.create)throw new Error('Trình duyệt chưa hỗ trợ mô hình dịch trên thiết bị. Hãy dùng Chrome có Translator API hoặc bổ sung bản dịch thủ công.');
 if(language==='vi')return 0;
 const translator=await TranslatorAPI.create({sourceLanguage:'vi',targetLanguage:language});
 let count=0;
 try{
  for(const record of records){
   const vi=split(record?.nameVi||record?.name).vi,key=normalize(vi);
   if(!vi||cache.has(language+'|'+key)||overrides.has(language+'|'+key))continue;
   if(language==='zh'&&(record?.nameZh||split(record.name).zh))continue;
   if(language==='en'&&(gloss.has(key)||[...gloss.keys()].some(x=>key.startsWith(x))))continue;
   const translated=await translator.translate(vi);
   if(translated&&translated.trim()){
    cache.set(language+'|'+key,translated.trim());missing.delete(vi);count++;
   }
  }
 }finally{translator.destroy?.()}
 return count;
}
