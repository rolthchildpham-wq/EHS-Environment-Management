// Optional browser-only OCR helper for printed forms and numeric entries.
// This is NOT reliable AI handwriting recognition and never saves data automatically.
const $=id=>document.getElementById(id);
const info=s=>{if($('opsOcrStatus'))$('opsOcrStatus').textContent=s;};
let libraryPromise=null;
function loadOCR(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(libraryPromise)return libraryPromise;
 libraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('Không khởi động được Tesseract'));
  script.onerror=()=>reject(Error('Không tải được thư viện OCR; hãy kiểm tra kết nối mạng'));
  document.head.appendChild(script);
 });
 return libraryPromise;
}
async function rotateImage(file,degrees){
 if(!degrees)return file;
 const image=await createImageBitmap(file);
 const canvas=document.createElement('canvas');
 const turn=degrees===90||degrees===270;
 canvas.width=turn?image.height:image.width;canvas.height=turn?image.width:image.height;
 const c=canvas.getContext('2d');
 c.translate(canvas.width/2,canvas.height/2);
 c.rotate(degrees*Math.PI/180);c.drawImage(image,-image.width/2,-image.height/2);
 image.close();
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Không xoay được ảnh')),'image/png'));
}
export function mountOCR(){
 const host=$('opsOcrMount');if(!host)return;
 host.innerHTML='<div class="panel" style="margin-top:18px"><h3>OCR ảnh bảng biểu – hỗ trợ kiểm tra (thử nghiệm)</h3>'+
 '<p class="muted">Đọc chữ in và con số trong ảnh ngay trên thiết bị bằng Tesseract.js. Chữ viết tay, dấu tiếng Việt, bảng xoay/nghiêng dễ sai. Kết quả chỉ là bản nháp để đối chiếu, <b>không tự ghi vào Firestore</b>.</p>'+
 '<div class="controls"><label>Ảnh (tối đa 10 mỗi lượt)<input type="file" id="opsOcrFiles" multiple accept="image/png,image/jpeg,image/webp"></label>'+
 '<label>Xoay ảnh trước khi đọc<select id="opsOcrRotate"><option value="0">Không xoay</option><option value="90">90° theo chiều kim đồng hồ</option><option value="180">180°</option><option value="270">270°</option></select></label>'+
 '<button id="opsOcrStart">Đọc văn bản từ ảnh</button><button id="opsOcrCopy">Sao chép kết quả</button></div>'+
 '<p id="opsOcrStatus" class="muted" role="status" aria-live="polite">Chưa quét ảnh.</p>'+
 '<label>Văn bản nhận dạng – cần đối chiếu ảnh gốc<textarea rows="10" id="opsOcrText" style="width:100%" placeholder="Số liệu OCR sẽ xuất hiện tại đây; có thể sửa và sao chép sang biểu mẫu thủ công phía trên."></textarea></label></div>';
 $('opsOcrCopy').onclick=()=>navigator.clipboard.writeText($('opsOcrText').value).then(()=>info('Đã sao chép bản nháp OCR.')).catch(()=>info('Không sao chép được, hãy chọn và sao chép văn bản.'));
 $('opsOcrStart').onclick=async()=>{
  const files=[...$('opsOcrFiles').files||[]].slice(0,10),degrees=Number($('opsOcrRotate').value);
  if(!files.length)return info('Hãy chọn ít nhất một ảnh.');
  const button=$('opsOcrStart');button.disabled=true;
  let worker;
  try{
   const Tesseract=await loadOCR();
   worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')info('Đang đọc ảnh: '+Math.round(m.progress*100)+'%')}});
   const texts=[];
   for(let i=0;i<files.length;i++){
    const file=files[i];info('Đang xử lý ảnh '+(i+1)+'/'+files.length+' – '+file.name);
    const img=await rotateImage(file,degrees);
    const result=await worker.recognize(img);
    texts.push('===== Ảnh '+(i+1)+': '+file.name+' =====\n'+String(result.data.text||''));
    $('opsOcrText').value=texts.join('\n\n');
   }
   info('Hoàn thành OCR '+files.length+' ảnh. Bắt buộc kiểm tra số liệu với ảnh gốc trước khi lưu.');
  }catch(e){info('OCR chưa thực hiện được: '+e.message)}
  finally{if(worker)await worker.terminate().catch(()=>{});button.disabled=false}
 };
}
