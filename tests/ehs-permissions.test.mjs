import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(name,'utf8');
test('EHS administrator receives detailed permission matrix, no TOPKEY-specific UI',()=>{
 const index=read('public/index.html'),permissions=read('public/ehs-permissions.js');
 assert.match(index,/id="permissionMatrixMount"/);
 assert.match(permissions,/Phân quyền chi tiết EHS/);
 for(const id of ['dashboard','journal','qr_in','qr_out','excel_import','manual_entry','reports','report_export','map','map_edit','compliance','ghg_write','review_approve','users_manage','permissions_manage','public_publish','data_reset']){
  assert.ok(permissions.includes("'"+id+"'"),id);
 }
 assert.match(permissions,/data-ehs-action/);
 assert.match(permissions,/ehs_permissions/);
 assert.doesNotMatch(permissions,/BTC Vlog|TikTok|TOPKEY/);
});
test('Admin cannot delegate account management, reset or permission management',()=>{
 const policy=read('public/ehs-permissions.js');
 assert.match(policy,/type==='admin'/);
 assert.match(policy,/role==='viewer'&&type!=='view'/);
 assert.match(policy,/currentRole==='admin'/);
});
test('Firestore respects EHS QR import and manual capability selection',()=>{
 const rules=read('firestore.rules');
 for(const id of ['qr_in','qr_out','excel_import','manual_entry','ghg_write']){
  assert.ok(rules.includes("allowed('"+id+"')"),id);
 }
 assert.match(rules,/function permissionsPath\(\)/);
 assert.match(rules,/match \/settings\/\{id\}/);
 assert.match(rules,/allow write: if admin\(\)/);
});
test('EHS app loads permission state before other modules',()=>{
 const app=read('public/app.js'),qr=read('public/ehs-qr-stock.js');
 assert.match(app,/await loadEhsPermissions\(db,u,role\)/);
 assert.match(app,/applyRights\(\)/);
 assert.match(qr,/may\('qr_in'\)/);
 assert.match(qr,/may\('qr_out'\)/);
});
