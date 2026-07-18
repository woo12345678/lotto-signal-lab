const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const id of ['drumStudio', 'lottoDrumCanvas', 'drumStartButton', 'drumStatus', 'drawnBallRail']) {
  assert(html.includes(`id="${id}"`), `index.html에 #${id}가 필요합니다.`);
}
assert(html.includes('drum-engine.js'), '물리 엔진 스크립트를 로드해야 합니다.');
assert(html.includes('drum-animation.js'), '드럼 애니메이터 스크립트를 로드해야 합니다.');
assert(fs.existsSync(path.join(root, 'drum-animation.js')), 'drum-animation.js가 필요합니다.');

console.log('PASS: physical draw studio markup and scripts');
