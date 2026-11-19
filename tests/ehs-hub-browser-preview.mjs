import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {mkdirSync} from 'node:fs';

const origin=(process.env.EHS_PREVIEW_URL||'').replace(/\/$/,'');
assert.ok(origin.startsWith('https://ehs-environment-management--'),'Preview URL is required');
mkdirSync('tests/artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [device,viewport] of Object.entries({desktop:{width:1440,height:900},mobile:{width:390,height:844}})){
  const page=await browser.newPage({viewportSize:viewport});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));

  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#hubCards .ehs-hub-card').first().waitFor();
  assert.equal(await page.locator('#hubCards .ehs-hub-card').count(),2,device+': exactly two Hub tiles');
  assert.equal(await page.locator('body > header').evaluate(el=>getComputedStyle(el).display),'none',device+': no EHS header on Hub');
  assert.equal(await page.locator('#tabs').evaluate(el=>getComputedStyle(el).display),'none',device+': no EHS tabs on Hub');
  assert.equal(await page.locator('#portal').evaluate(el=>getComputedStyle(el).display),'block',device+': Hub is sole section');
  assert.equal(await page.locator('iframe').count(),0,device+': no SCADA iframe');
  assert.match(await page.locator('[data-hub="wwtp"]').getAttribute('href'),/^wwtp\/$/);
  await page.screenshot({path:`tests/artifacts/hub-${device}.png`});
  console.log('PASS',device,'Hub-only, 2 tiles, no header/tabs/iframe');

  await page.goto(origin+'/?app=environment',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#dashboard').waitFor({state:'visible',timeout:20000});
  assert.notEqual(await page.locator('body > header').evaluate(el=>getComputedStyle(el).display),'none',device+': EHS header visible');
  assert.equal(await page.locator('#portal').evaluate(el=>getComputedStyle(el).display),'none',device+': Hub hidden in EHS');
  await page.screenshot({path:`tests/artifacts/environment-${device}.png`});
  console.log('PASS',device,'separate Environmental EHS page');

  await page.goto(origin+'/wwtp/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#ehsBackHub').waitFor({state:'attached'});
  assert.equal(await page.locator('#ehsBackHub').getAttribute('href'),'../');
  assert.equal(await page.locator('iframe').count(),0,device+': WWTP has no iframe');
  await page.screenshot({path:`tests/artifacts/wwtp-${device}.png`});
  console.log('PASS',device,'standalone WWTP route with EHS auth gate');
  await page.goto(origin+'/weighing/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#weightInput').waitFor({state:'attached'});
  assert.equal(await page.locator('#typeDialog').count(),1,device+': category change dialog');
  assert.equal(await page.locator('#tare').count(),1,device+': tare input');
  await page.screenshot({path:`tests/artifacts/weighing-${device}.png`});
  console.log('PASS',device,'waste weighing route, login gate and entry form');
  await page.goto(origin+'/weighing/?type=ctnh-metal-packaging',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#weightInput').waitFor({state:'attached'});
  await page.evaluate(()=>{document.body.classList.add('kiosk-ready');document.querySelector('#session').hidden=false});
  assert.equal(await page.locator('#kioskChangeType').isVisible(),true,device+': change type button visible');
  assert.equal(await page.locator('#weighDetail').isVisible(),false,device+': detailed panels hidden');
  assert.equal(await page.locator('#qrCode').isVisible(),false,device+': QR admin panel hidden');
  assert.equal(await page.locator('#addWeight').isVisible(),true,device+': OK action visible');
  const viewportHeight=await page.evaluate(()=>document.documentElement.clientHeight);
  const kioskHeight=await page.locator('#session').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(kioskHeight>=viewportHeight-2,device+': full viewport kiosk');
  await page.screenshot({path:`tests/artifacts/weighing-kiosk-${device}.png`});
  console.log('PASS',device,'full-viewport QR kiosk with only weight / OK / change type');
  const fatal=errors.filter(x=>/SyntaxError|ReferenceError|TypeError/.test(x));
  assert.equal(fatal.length,0,device+': JS fatal '+fatal.join('|'));
  await page.close();
 }
}finally{await browser.close();}
