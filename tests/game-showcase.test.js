const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const games = [
  ['https://play.google.com/store/apps/details?id=com.DOORIAN.Magic_Brick', 'magic-brick.png'],
  ['https://do0rian.itch.io/fart-millionaire', 'fart-millionaire.png'],
  ['https://do0rian.itch.io/takoyaki-street-empire', 'takoyaki-street-empire.png'],
  ['https://do0rian.itch.io/maketteok', 'make-tteok.png'],
  ['https://do0rian.itch.io/m5zkth', 'neon-dash-survivor.gif']
];

assert(html.includes('id="gameShowcase"'), '게임 광고 쇼케이스 섹션이 필요합니다.');
assert.strictEqual((html.match(/class="game-ad-card/g) || []).length, 5, '게임 광고 카드는 5개여야 합니다.');
for (const [url, image] of games) {
  assert(html.includes(`href="${url}"`), `${url} 링크가 필요합니다.`);
  assert(html.includes(`assets/games/${image}`), `${image} 로컬 이미지가 필요합니다.`);
  assert(fs.existsSync(path.join(root, 'assets', 'games', image)), `${image} 파일이 실제로 존재해야 합니다.`);
}
const cardLinks = [...html.matchAll(/<a class="game-ad-card[\s\S]*?<\/a>/g)].map(match => match[0]);
assert.strictEqual(cardLinks.length, 5);
cardLinks.forEach(card => {
  assert(card.includes('target="_blank"'), '광고 링크는 새 탭으로 열려야 합니다.');
  assert(card.includes('rel="noopener noreferrer"'), '광고 링크에 안전 속성이 필요합니다.');
});
console.log('PASS: five self-promotion game ads with local assets and safe links');
