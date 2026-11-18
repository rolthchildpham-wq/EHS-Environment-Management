import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('EHS Hub exposes exactly the intended two modules',()=>{
 const html=file('public/index.html');
 assert.match(html,/id="portal"/);
 assert.match(html,/HỆ THỐNG VẬN HÀNH XLNT/);
 assert.match(html,/HỆ THỐNG DỮ LIỆU MÔI TRƯỜNG/);
 assert.match(html,/id="wwtpFrame"/);
 assert.doesNotMatch(html,/<iframe[^>]+src="https?:/);
});

test('EHS menu launches WWTP only through the existing permission check',()=>{
 const app=file('public/app.js');
 assert.match(app,/portal:'hub_view',wwtp:'wwtp_view'/);
 assert.match(app,/const can=signedIn&&may\('hub_view'\)/);
 assert.match(app,/if\(!may\(\(\{portal:'hub_view'/);
 assert.match(app,/wwtp\/index\.html/);
});

test('EHS rights reuse the existing centrally managed permissions matrix',()=>{
 const rights=file('public/ehs-permissions.js');
 for(const a of ['hub_view','wwtp_view','wwtp_simulate','wwtp_reports','wwtp_design'])assert.match(rights,new RegExp("'"+a+"'"));
 assert.match(rights,/currentUser&&currentRole/);
 assert.match(rights,/settings','ehs_permissions/);
});

test('WWTP loads same EHS Firebase authentication and checks membership',()=>{
 const gate=file('public/wwtp/ehs-auth-guard.js');
 assert.match(gate,/import '..\/firebase-config\.js'/);
 assert.match(gate,/resolveMember\(db,user\)/);
 assert.match(gate,/loadEhsPermissions\(db,user,role\)/);
 assert.match(gate,/may\('wwtp_view'\)/);
 assert.match(gate,/onAuthStateChanged\(/);
 assert.match(gate,/protect\(simFns,'wwtp_simulate'\)/);
 assert.match(gate,/protect\(adminFns,'wwtp_design'\)/);
});

test('WWTP includes full offline HMI simulation, shift report and P&ID',()=>{
 const html=file('public/wwtp/index.html');
 assert.match(html,/id="pidSvg"/);
 assert.match(html,/toggleSimulationMode/);
 assert.match(html,/renderShiftReport/);
 assert.match(html,/setTankCalibration/);
 assert.match(html,/setPumpCalibration/);
 assert.match(html,/ehs-auth-guard\.js/);
});


test('Simulation tab contains tank and pump calibration; report links back to one shared configuration',()=>{
 const html=file('public/wwtp/index.html');
 const simStart=html.indexOf('id="view-simulation"');
 const equipmentStart=html.indexOf('id="view-equipment"');
 const reportStart=html.indexOf('id="view-report"');
 const calibrationStart=html.indexOf('id="simCalibrationSection"');
 assert.ok(simStart>=0 && simStart<calibrationStart && calibrationStart<equipmentStart && equipmentStart<reportStart);
 assert.equal((html.match(/id="tankCalibRows"/g)||[]).length,1);
 assert.equal((html.match(/id="pumpCalibRows"/g)||[]).length,1);
 assert.match(html,/function jumpToSimulationCalibration\(\)/);
 assert.match(html,/function renderSimulationSummary\(\)/);
 assert.match(html,/if\(tabName==='simulation'\)\{renderPlantCalibration\(\)/);
 assert.match(html,/renderShiftReport\(\)/);
});
