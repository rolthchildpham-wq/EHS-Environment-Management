import assert from 'node:assert/strict';

const base = process.env.EHS_PREVIEW_URL;
assert.ok(base && /^https:\/\/ehs-environment-management--[^/]+\.web\.app\/?$/.test(base), 'Expected a Firebase Hosting preview URL');
const origin = base.replace(/\/$/, '');

async function served(path, matches = []) {
  const url = origin + path;
  let response;
  // Newly published Hosting preview routes may briefly return 404 before CDN propagation.
  for (let attempt = 0; attempt < 8; attempt++) {
    response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (response.status === 200 || response.status !== 404) break;
    if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.equal(response.status, 200, `${url} HTTP ${response.status}`);
  const html = await response.text();
  assert.ok(html.length > 200, `${url} returned empty response`);
  for (const [description, pattern] of matches) {
    assert.match(html, pattern, `${path}: ${description}`);
  }
  console.log('PASS preview', path, response.status, html.length + ' chars');
  return html;
}

const hub = await served('/', [
  ['Hub visible', /TRUNG TÂM HỆ THỐNG MÔI TRƯỜNG/],
  ['WWTP independent destination', /href="wwtp\/"/],
  ['Environment destination', /href="\?app=environment"/],
  ['Hub only mode', /ehs-hub-mode/]
]);
assert.doesNotMatch(hub, /<iframe\b|id="wwtpFrame"/, 'No embedded SCADA allowed');
await served('/?app=environment', [['environment route', /id="dashboard"/]]);
await served('/app.js', [['auth-gated navigation', /may\('hub_view'\)/], ['environment route', /environmentMode/]]);
await served('/wwtp/', [['standalone P&ID', /id="pidSvg"/], ['back to Hub', /id="ehsBackHub"/]]);
await served('/wwtp/ehs-auth-guard.js', [['same EHS member check', /resolveMember\(db,user\)/]]);
await served('/weighing/', [['daily weighing form', /id="weightInput"/], ['tare input', /id="tare"/], ['approval list', /id="pending"/]]);
await served('/weighing/weighing.js', [['Firestore aggregate transaction', /runTransaction\(/], ['EHS member gate', /resolveMember\(db,u\)/]]);
console.log('PASS all preview static routes');
