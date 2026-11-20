import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';

test('hub exits after authorization and before mounting data-heavy modules', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const auth = source.slice(source.indexOf('onAuthStateChanged(auth,async u=>'));
  const permissions = auth.indexOf('await loadEhsPermissions(db,u,role)');
  const exit = auth.indexOf("document.documentElement.classList.contains('ehs-hub-mode')");
  const mount = auth.indexOf('mountOperations(db,u,role,reload)');
  assert.ok(permissions >= 0 && exit > permissions && exit < mount);
  assert.match(auth.slice(exit, mount), /return/);
});
