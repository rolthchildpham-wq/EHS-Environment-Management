const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
admin.initializeApp();
const GEMINI_KEY=defineSecret('GEMINI_API_KEY');
async function requireRole(req,roles){
 if(!req.auth)throw new HttpsError('unauthenticated','Đăng nhập trước');
 const snapshot=await admin.firestore().doc('members/'+req.auth.uid).get();
 if(!snapshot.exists||!roles.includes(snapshot.data().role))throw new HttpsError('permission-denied','Không có quyền');
}
exports.readEvidence=onCall({secrets:[GEMINI_KEY],maxInstances:10,timeoutSeconds:60},async(req)=>{
 await requireRole(req,['admin','editor']);
 const {imageBase64,mimeType,kind}=req.data||{};
 if(!['image/jpeg','image/png','image/webp'].includes(mimeType)||typeof imageBase64!=='string'||imageBase64.length>12500000||!['waste','water','stock'].includes(kind)){
  throw new HttpsError('invalid-argument','Ảnh hoặc loại chứng từ không hợp lệ');
 }
 const prompt='Đọc ảnh chứng từ môi trường ('+kind+') bằng tiếng Việt hoặc Trung. Chỉ trích xuất những gì nhìn thấy, tuyệt đối không đoán. Trả về JSON object: date (YYYY-MM-DD hoặc null), entries (mảng object {kind: waste|water_in|water_out|stock_in|stock_out|cost|revenue, value: number, unit: string, name: string, note: string, confidence: number 0..1}), warnings (mảng string). Nếu không chắc thì ghi vào warnings, không tự phê duyệt.';
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(GEMINI_KEY.value()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:imageBase64}}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})});
 if(!response.ok)throw new HttpsError('internal','Dịch vụ AI tạm thời không phản hồi');
 const payload=await response.json();const raw=payload.candidates?.[0]?.content?.parts?.[0]?.text;
 let result;try{result=JSON.parse(raw)}catch{throw new HttpsError('internal','AI trả về JSON không hợp lệ')}
 result.entries=(Array.isArray(result.entries)?result.entries:[]).filter(x=>['waste','water_in','water_out','stock_in','stock_out','cost','revenue'].includes(x.kind)&&Number.isFinite(x.value)&&x.value>=0).slice(0,100);
 return result;
});
exports.approveReview=onCall(async(req)=>{
 await requireRole(req,['admin']);
 const id=req.data?.id;
 if(typeof id!=='string'||!id||id.length>150)throw new HttpsError('invalid-argument','ID không hợp lệ');
 const db=admin.firestore();
 return db.runTransaction(async tx=>{
  const ref=db.doc('reviews/'+id),snap=await tx.get(ref);
  if(!snap.exists||snap.data().status!=='pending')throw new HttpsError('failed-precondition','Chứng từ không ở trạng thái chờ duyệt');
  const entries=Array.isArray(snap.data().entries)?snap.data().entries:[];
  if(entries.length>100)throw new HttpsError('invalid-argument','Quá nhiều dòng');
  for(const x of entries){
   if(!['waste','water_in','water_out','stock_in','stock_out','cost','revenue'].includes(x.kind)||!Number.isFinite(x.value)||x.value<0||!/^\d{4}-\d{2}-\d{2}$/.test(x.date||''))throw new HttpsError('invalid-argument','Dòng không hợp lệ');
   tx.create(db.collection('records').doc(),{kind:x.kind,date:x.date,value:x.value,unit:String(x.unit||''),name:String(x.name||''),note:String(x.note||''),source:'ai_review',reviewId:id,createdBy:req.auth.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  }
  tx.update(ref,{status:'approved',reviewedBy:req.auth.uid,reviewedAt:admin.firestore.FieldValue.serverTimestamp()});
  tx.create(db.collection('audit').doc(),{action:'approve_review',reviewId:id,count:entries.length,actor:req.auth.uid,at:admin.firestore.FieldValue.serverTimestamp()});
  return {count:entries.length};
 });
});

// Raw monthly metrics only. Financial reconciliation (A.TK/A.3/C) must not use
// these totals until a verified historical backfill and reconciliation exist.
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
function operationContribution(data){
 if(!data||typeof data.date!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date))return null;
 const kind=String(data.kind||'');
 if(!['waste','water_in','water_out'].includes(kind))return null;
 const quantity=Number(data.quantity);
 if(!Number.isFinite(quantity)||quantity<0)return null;
 return {month:data.date.slice(0,7),kind,quantity};
}
exports.aggregateOperationMonth=onDocumentWritten({document:'operations/{id}',maxInstances:5},async event=>{
 const before=operationContribution(event.data?.before?.data());
 const after=operationContribution(event.data?.after?.data());
 if(!before&&!after)return;
 const db=admin.firestore();
 const marker=db.doc('aggregate_events/'+event.id);
 await db.runTransaction(async tx=>{
  if((await tx.get(marker)).exists)return;
  const changes=new Map();
  for(const [item,sign] of [[before,-1],[after,1]]){
   if(!item)continue;
   const key=item.month,field=item.kind==='waste'?'wasteKg':item.kind==='water_in'?'waterInM3':'waterOutM3';
   if(!changes.has(key))changes.set(key,{});
   changes.get(key)[field]=(changes.get(key)[field]||0)+sign*item.quantity;
   changes.get(key).recordCount=(changes.get(key).recordCount||0)+sign;
  }
  for(const [month,delta] of changes){
   const ref=db.doc('operation_monthly_metrics/'+month);
   const patch={updatedAt:admin.firestore.FieldValue.serverTimestamp()};
   for(const [key,value] of Object.entries(delta))patch[key]=admin.firestore.FieldValue.increment(value);
   tx.set(ref,patch,{merge:true});
  }
  tx.create(marker,{month:after?.month||before?.month,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 });
});
