const assert = require('assert');
const fs = require('fs');
const path = require('path');
const engine = require('../analysis.js');

function seededRandom(seed = 20260710) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'lotto-history.json'), 'utf8'));
  assert(payload.draws.length >= 1200, '전체 회차 데이터가 충분해야 합니다.');
  assert.strictEqual(payload.draws.at(-1).draw_no, payload.latest_draw);
  payload.draws.forEach(draw => {
    assert.strictEqual(draw.numbers.length, 6);
    assert.strictEqual(new Set(draw.numbers).size, 6);
    draw.numbers.forEach(number => assert(number >= 1 && number <= 45));
  });

  const stats = engine.calculateStats(payload.draws);
  assert.strictEqual(stats.details.length, 45);
  assert.strictEqual(stats.frequency.slice(1).reduce((a, b) => a + b, 0), payload.draws.length * 6);

  const report = await engine.runSimulation(payload.draws, 50000, { random: seededRandom(), chunkSize: 5000 });
  assert.strictEqual(report.topSets.length, 5);
  report.topSets.forEach(set => {
    assert.strictEqual(set.numbers.length, 6);
    assert.strictEqual(new Set(set.numbers).size, 6);
    assert.deepStrictEqual(set.numbers, [...set.numbers].sort((a, b) => a - b));
  });
  const totalSelections = report.counts.slice(1).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalSelections, 50000 * 6);
  const rateSum = report.numberRanking.reduce((sum, item) => sum + item.simulationRate, 0);
  assert(Math.abs(rateSum - 600) < 0.0001, '개별 번호 선택률의 합은 600%여야 합니다.');
  assert.strictEqual(engine.COMBINATION_ODDS, 8145060);
  console.log(`PASS: ${payload.draws.length} draws, 50,000 simulations, 5 ranked sets`);
}

main().catch(error => { console.error(error); process.exit(1); });
