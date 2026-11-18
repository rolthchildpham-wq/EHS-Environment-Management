import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Landing URL is Hub-only, with two independent module links and no embedded SCADA',()=>{
 const html=file('public/index.html');
 assert.match(html,/id="portal"/);
 assert.match(html,/HỆ THỐNG VẬN HÀNH XLNT/);
 assert.match(html,/HỆ THỐNG DỮ LIỆU MÔI TRƯỜNG/);
 assert.match(html,/href="wwtp\/"[^>]*data-hub="wwtp"|data-hub="wwtp"[^>]*href="wwtp\/"/);
 assert.match(html,/href="\?app=environment"/);
 assert.match(html,/ehs-hub-mode/);
 assert.match(html,/body>header\{display:none!important\}/);
 assert.doesNotMatch(html,/id="wwtpFrame"|<iframe\b|<section id="wwtp"/);
});

test('Hub choices navigate to full pages, never EHS application tabs',()=>{
 const app=file('public/app.js');
 const html=file('public/index.html');
 assert.match(app,/const labels=\{dashboard:/);
 assert.doesNotMatch(app,/wwtpFrame|frame\.src|portal:'Hệ thống Hub'|wwtp:'Vận hành XLNT'/);
 assert.match(app,/document\.querySelectorAll\('\[data-hub\]'\)/);
 assert.match(app,/const allowed=!!user&&!!role&&may\('hub_view'\)/);
 assert.match(app,/target==='wwtp'\?may\('wwtp_view'\)/);
 assert.match(app,/document\.documentElement\.classList\.contains\('ehs-environment-mode'\)/);
 assert.match(html,/html\.ehs-hub-mode main>section:not\(#portal\)\{display:none!important\}/);
});

test('Separate environment destination keeps existing EHS dashboard and login',()=>{
 const html=file('public/index.html'),app=file('public/app.js');
 assert.match(html,/id="dashboard"/);
 assert.match(html,/id="login"/);
 assert.match(html,/id="hubLogin"/);
 assert.match(html,/id="hubLogout"/);
 assert.match(html,/class="ehs-back-hub" href="\.\/" /);
 assert.match(app,/el\('hubLogin'\)\.onclick=/);
 assert.match(app,/el\('hubLogout'\)\.onclick=/);
 assert.match(app,/el\('dashboard'\)\.classList\.add\('active'\)/);
});

test('WWTP is served as a standalone full-width page and can return to Hub',()=>{
 const html=file('public/wwtp/index.html');
 const guard=file('public/wwtp/ehs-auth-guard.js');
 assert.match(html,/id="ehsWwtpBackBar"/);
 assert.match(html,/id="ehsBackHub"/);
 assert.match(html,/href="\.\.\/" id="ehsBackHub"/);
 assert.match(html,/id="pidSvg"/);
 assert.match(html,/ehs-auth-guard\.js/);
 assert.match(guard,/href="\.\.\/"\>Về Hub EHS/);
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


test('Immersive P&ID hides bars and retains a visible exit control on mobile',()=>{
 const html=file('public/wwtp/index.html');
 assert.match(html,/id="topkey-pid-immersive-v34"/);
 assert.match(html,/id="pidFullscreenExit"/);
 assert.match(html,/function syncPidFullscreenPresentation\(\)/);
 assert.match(html,/#pidFullscreenBox:is\(:fullscreen,\.pid-fallback-fullscreen\)>:not\(#pidViewport\)/);
 assert.match(html,/#pidFullscreenBox:is\(:fullscreen,\.pid-fallback-fullscreen\)>#pidViewport/);
 assert.match(html,/height:100dvh!important/);
 assert.match(html,/document\.addEventListener\('fullscreenchange',syncPidFullscreenPresentation\)/);
 assert.match(html,/window\.addEventListener\('resize'/);
 assert.match(html,/syncPidOverlayPlacement\(\)/);
});
test('Dosing and sludge routing additions are present and guarded by EHS rights',()=>{
 const html=file('public/wwtp/index.html');
 const guard=file('public/wwtp/ehs-auth-guard.js');
 for(const marker of ['v33LogicConfig','v33SludgeRoute','simPh102','pipe-pm203-return-aerotank','chemChip-NaOH','chemChip-PAC','renderChemicalDiagramStatus'])
  assert.ok(html.includes(marker),marker+' missing');
 for(const name of ['setSimulatedPH','saveDosingSettings','setSludgeRoute'])
  assert.ok(guard.includes("'"+name+"'"),name+' not EHS-guarded');
 assert.match(guard,/protect\(simFns,'wwtp_simulate'\)/);
 assert.match(guard,/protect\(adminFns,'wwtp_design'\)/);
});
