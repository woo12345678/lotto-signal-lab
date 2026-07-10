const fs = require('fs');
const path = require('path');

const BASE = 'https://smok95.github.io/lotto/results';
const OUT = path.join(__dirname, '..', 'data', 'lotto-history.json');

async function getJson(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Lotto-Signal-Lab/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      last = error;
      await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
    }
  }
  throw last;
}

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

async function main() {
  const latest = await getJson(`${BASE}/latest.json`);
  const drawNumbers = Array.from({ length: latest.draw_no }, (_, i) => i + 1);
  console.log(`Fetching draws 1–${latest.draw_no}...`);
  const draws = await pool(drawNumbers, 18, async (drawNo, index) => {
    if ((index + 1) % 100 === 0) console.log(`  ${index + 1}/${drawNumbers.length}`);
    return getJson(`${BASE}/${drawNo}.json`);
  });
  const payload = {
    source: BASE,
    fetched_at: new Date().toISOString(),
    latest_draw: latest.draw_no,
    draws: draws.sort((a, b) => a.draw_no - b.draw_no)
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(`Saved ${draws.length} draws to ${OUT}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
