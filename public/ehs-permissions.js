import {doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const actions=[
 ['hub_view','Truy cập Hub hệ thống','view'],
 ['wwtp_view','XLNT • Truy cập và xem P&ID','view'],
 ['wwtp_simulate','XLNT • Bật/tắt và điều khiển mô phỏng','write'],
 ['wwtp_sim_config','XLNT • Cài ngưỡng pH và hướng bùn SIM','write'],
 ['wwtp_reports','XLNT • Xem báo cáo vận hành','view'],
 ['wwtp_calibration','XLNT • Hiệu chuẩn bể và lưu lượng bơm (hồ sơ)','write'],
 ['wwtp_prod_view','XLNT • Xem hồ sơ thông số Production (không điều khiển PLC)','view'],
 ['wwtp_design','XLNT • Thiết kế bố cục P&ID','admin'],
 ['dashboard','Xem Tổng quan','view'],
 ['journal','Xem Nhật ký','view'],
 ['waste_weigh','Nhập cân rác bằng QR và lưu bao bì','write'],
 ['qr_in','Nhập vật tư bằng QR','write'],
 ['qr_out','Xuất/sử dụng vật tư bằng QR','write'],
 ['excel_import','Nhập dữ liệu Excel','write'],
 ['manual_entry','Nhập số liệu thủ công / chứng từ','write'],
 ['reports','Xem báo cáo tài chính, XLNT và Cây xanh','view'],
 ['report_export','Xuất Excel, PDF, PowerPoint','write'],
 ['map','Xem bản đồ nhà máy','view'],
 ['map_edit','Chỉnh sửa bản đồ và vị trí','admin'],
 ['compliance','Xem chỉ số EHS & ISO','view'],
 ['ghg_write','Nhập dữ liệu phát thải','write'],
 ['review_approve','Phê duyệt chứng từ','admin'],
 ['users_manage','Quản lý tài khoản','admin'],
 ['permissions_manage','Thiết lập phân quyền','admin'],
 ['public_publish','Công bố Viewer công khai','admin'],
 ['data_reset','Xóa / đặt lại dữ liệu','admin']
];
export const defaultMatrix=()=>Object.fromEntries(['editor','viewer'].map(role=>[
 role,Object.fromEntries(actions.map(([key,,type])=>[key,role==='editor'?type!=='admin':type==='view']))
]));
let matrix=defaultMatrix(),currentRole=null,currentUser=null,currentDb=null;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const may=action=>{if(action==='hub_view'||action.startsWith('wwtp_'))return Boolean(currentUser&&currentRole&&(currentRole==='admin'||matrix[currentRole]?.[action]===true));return currentRole==='admin'||Boolean(matrix[currentRole||'viewer']?.[action]===true)};
export const rights=()=>JSON.parse(JSON.stringify(matrix));
export function applyRights(){
 const page={portal:'hub_view',wwtp:'wwtp_view',dashboard:'dashboard',records:'journal',map:'map',import:'excel_import',reports:'reports',admin:'users_manage',compliance:'compliance'};
 document.querySelectorAll('[data-tab]').forEach(btn=>{const key=page[btn.dataset.tab];btn.hidden=!!key&&!may(key)});
 const active=document.querySelector('[data-tab].active');
 if(active?.hidden){const next=[...document.querySelectorAll('[data-tab]')].find(x=>!x.hidden);next?.click()}
 const block=(id,key)=>{const el=$(id);if(el)el.hidden=!may(key)};
 block('qrStockMount','journal');block('publicPublisherMount','public_publish');
 block('memberAdminMount','users_manage');block('resetDataMount','data_reset');
 block('exportExcel','report_export');block('reportExcel','report_export');
 for(const id of ['costDashboardExport','simpleFinanceExport','opsExportAll','opsExportMonth'])block(id,'report_export');
 block('printReport','report_export');block('reportPpt','report_export');
 block('parseExcel','excel_import');block('saveImport','excel_import');
 block('submitEvidence','manual_entry');
 document.querySelectorAll('[data-review]').forEach(el=>{el.hidden=!may('review_approve')});
 window.dispatchEvent(new CustomEvent('ehs-permissions-changed',{detail:{role:currentRole}}));
}
function renderPanel(){
 const mount=$('permissionMatrixMount');if(!mount)return;
 if(currentRole!=='admin'||!currentUser){mount.innerHTML='';return}
 mount.innerHTML='<div class="panel ehs-permission-panel"><h2>Phân quyền chi tiết EHS</h2>'+
 '<p class="muted">Admin đánh dấu quyền cho Nhân viên nhập liệu và Viewer. Quyền Admin cố định, không thể bỏ chọn. Nhấn Lưu để áp dụng cho tài khoản hiện có và người được mời.</p>'+
 '<div class="scroll"><table class="ehs-permission-table"><thead><tr><th>Chức năng</th><th>Admin</th><th>Nhập liệu (Editor)</th><th>Viewer</th></tr></thead><tbody>'+
 actions.map(([key,title,type])=>'<tr'+(key.startsWith('wwtp_')?' class="ehs-wwtp-right-row"':'')+'><td>'+esc(title)+'</td><td><input type="checkbox" checked disabled aria-label="Admin: '+esc(title)+'"></td>'+
 ['editor','viewer'].map(role=>'<td><input type="checkbox" data-ehs-action="'+key+'" data-ehs-role="'+role+'" '+
 (matrix[role]?.[key]?'checked ':'')+(type==='admin'||role==='viewer'&&type!=='view'?'disabled ':'')+
 'aria-label="'+(role==='editor'?'Editor':'Viewer')+': '+esc(title)+'"></td>').join('')+'</tr>').join('')+
 '</tbody></table></div><div class="controls"><button id="ehsRightsSave" class="primary" type="button">Lưu phân quyền</button>'+
 '<button id="ehsRightsDefault" type="button">Khôi phục mặc định trên biểu mẫu</button></div>'+
 '<p id="ehsRightsStatus" class="muted" role="status" aria-live="polite"></p></div>';
 $('ehsRightsDefault').onclick=()=>{matrix=defaultMatrix();renderPanel();$('ehsRightsStatus').textContent='Đã chọn quyền mặc định; nhấn Lưu để áp dụng.'};
 $('ehsRightsSave').onclick=saveMatrix;
}
async function saveMatrix(){
 if(currentRole!=='admin'||!currentUser||!currentDb)return;
 const updated=defaultMatrix();
 document.querySelectorAll('[data-ehs-action]').forEach(input=>{
  const action=input.dataset.ehsAction,role=input.dataset.ehsRole;
  if(!input.disabled&&Object.hasOwn(updated[role],action))updated[role][action]=input.checked;
 });
 const btn=$('ehsRightsSave'),status=$('ehsRightsStatus');btn.disabled=true;
 try{
  await setDoc(doc(currentDb,'settings','ehs_permissions'),{editor:updated.editor,viewer:updated.viewer,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
  const saved=await getDoc(doc(currentDb,'settings','ehs_permissions'));
  if(!saved.exists())throw Error('Không đọc lại được cấu hình vừa lưu');
  matrix=updated;applyRights();renderPanel();$('ehsRightsStatus').textContent='Đã lưu và xác minh phân quyền trên Firebase.';
 }catch(e){status.textContent='Lưu thất bại: '+e.message}
 finally{const save=$('ehsRightsSave');if(save)save.disabled=false}
}
export async function loadEhsPermissions(db,user,role){
 currentDb=db;currentUser=user;currentRole=role;matrix=defaultMatrix();
 if(db&&user&&role){
  try{
   const snap=await getDoc(doc(db,'settings','ehs_permissions'));
   if(snap.exists()){
    const payload=snap.data();
    for(const [key,,type] of actions)for(const r of ['editor','viewer']){
     const chosen=payload[r]?.[key];
     matrix[r][key]=type==='admin'||r==='viewer'&&type!=='view'?false:(typeof chosen==='boolean'?chosen:matrix[r][key]);
    }
   }
  }catch(e){console.warn('EHS permissions read failed',e)}
 }
 renderPanel();applyRights();
}
