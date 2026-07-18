const assert = require('assert');
const {
  createDrumState,
  stepDrum,
  simulatePhysicalDraw,
  isBallInsideDrum
} = require('../drum-engine.js');

function seededRandom(seed = 20260718) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function main() {
  const state = createDrumState({ width: 900, height: 620, random: seededRandom(7) });
  assert.strictEqual(state.balls.length, 45, '드럼에는 45개 공이 있어야 합니다.');
  assert.deepStrictEqual(state.balls.map(ball => ball.number).sort((a, b) => a - b), Array.from({ length: 45 }, (_, i) => i + 1));

  for (let i = 0; i < 900; i++) stepDrum(state, 1 / 60, { agitation: 1 });
  state.balls.forEach(ball => {
    assert(Number.isFinite(ball.x) && Number.isFinite(ball.y), '물리 좌표는 유한해야 합니다.');
    assert(isBallInsideDrum(state, ball), `공 ${ball.number}이 원통 경계를 벗어나면 안 됩니다.`);
  });

  const first = simulatePhysicalDraw({ random: seededRandom(991), warmupSteps: 720 });
  const replay = simulatePhysicalDraw({ random: seededRandom(991), warmupSteps: 720 });
  const other = simulatePhysicalDraw({ random: seededRandom(992), warmupSteps: 720 });
  assert.strictEqual(first.length, 6);
  assert.strictEqual(new Set(first).size, 6, '추첨 번호는 중복되면 안 됩니다.');
  first.forEach(number => assert(number >= 1 && number <= 45));
  assert.deepStrictEqual(first, replay, '같은 물리 시드는 같은 결과를 재현해야 합니다.');
  assert.notDeepStrictEqual(first, other, '다른 초기 물리 상태는 다른 결과를 만들어야 합니다.');

  console.log(`PASS: physical drum 45 balls -> ${first.join(', ')}`);
}

main();
