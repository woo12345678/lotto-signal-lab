const fs = require('fs');
const path = require('path');

const MIRROR_BASE = 'https://smok95.github.io/lotto/results';
const OFFICIAL_ENDPOINT = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do';
const OUT = path.join(__dirname, '..', 'data', 'lotto-history.json');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Lotto-Signal-Lab/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      last = error;
      await sleep(500 * (2 ** i) + Math.random() * 250);
    }
  }
  throw last;
}

function validateDraw(draw, expectedDrawNo) {
  if (!draw || draw.draw_no !== expectedDrawNo) throw new Error(`회차 불일치: expected ${expectedDrawNo}, got ${draw?.draw_no}`);
  if (!Array.isArray(draw.numbers) || draw.numbers.length !== 6 || new Set(draw.numbers).size !== 6) throw new Error(`${expectedDrawNo}회 번호 무결성 오류`);
  if (draw.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45)) throw new Error(`${expectedDrawNo}회 번호 범위 오류`);
  if (!Number.isInteger(draw.bonus_no) || draw.bonus_no < 1 || draw.bonus_no > 45 || draw.numbers.includes(draw.bonus_no)) throw new Error(`${expectedDrawNo}회 보너스 번호 오류`);
  return draw;
}

function mapOfficial(item) {
  const date = String(item.ltRflYmd || '');
  return {
    draw_no: Number(item.ltEpsd),
    numbers: [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo].map(Number),
    bonus_no: Number(item.bnsWnNo),
    date: date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z` : date,
    divisions: [{ prize: Number(item.rnk1WnAmt || 0), winners: Number(item.rnk1WnNope || 0) }],
    source: 'dhlottery'
  };
}

async function fetchOfficial(drawNo) {
  const url = `${OFFICIAL_ENDPOINT}?srchLtEpsd=${drawNo}`;
  const json = await getJson(url, 2);
  const item = json?.data?.list?.[0];
  if (!item) return null;
  return validateDraw(mapOfficial(item), drawNo);
}

async function fetchMirror(drawNo) {
  return validateDraw(await getJson(`${MIRROR_BASE}/${drawNo}.json`), drawNo);
}

async function seedFromMirror() {
  const latest = await getJson(`${MIRROR_BASE}/latest.json`);
  const draws = [];
  console.log(`Initial seed: mirror draws 1–${latest.draw_no}`);
  for (let start = 1; start <= latest.draw_no; start += 20) {
    const numbers = Array.from({ length: Math.min(20, latest.draw_no - start + 1) }, (_, i) => start + i);
    draws.push(...await Promise.all(numbers.map(fetchMirror)));
    if (draws.length % 100 === 0) console.log(`  ${draws.length}/${latest.draw_no}`);
  }
  return draws.sort((a, b) => a.draw_no - b.draw_no);
}

async function main() {
  let payload;
  if (fs.existsSync(OUT)) payload = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  else payload = { draws: await seedFromMirror(), latest_draw: 0 };

  payload.draws.sort((a, b) => a.draw_no - b.draw_no);
  payload.latest_draw = payload.draws.at(-1)?.draw_no || 0;
  let next = payload.latest_draw + 1;
  const additions = [];

  for (let checked = 0; checked < 5; checked++, next++) {
    let draw = null;
    try {
      draw = await fetchOfficial(next);
      if (draw) console.log(`Official data verified: ${next}`);
    } catch (error) {
      console.warn(`Official ${next} unavailable: ${error.message}`);
    }

    if (!draw) {
      try {
        const latestMirror = await getJson(`${MIRROR_BASE}/latest.json`, 2);
        if (latestMirror.draw_no >= next) {
          draw = await fetchMirror(next);
          console.log(`Mirror fallback: ${next}`);
        }
      } catch (error) {
        console.warn(`Mirror ${next} unavailable: ${error.message}`);
      }
    }

    if (!draw) break;
    additions.push(draw);
    await sleep(1200);
  }

  if (!additions.length) {
    console.log(`Already current at draw ${payload.latest_draw}; no file change.`);
    return;
  }

  payload.draws.push(...additions);
  payload.draws.sort((a, b) => a.draw_no - b.draw_no);
  payload.latest_draw = payload.draws.at(-1).draw_no;
  payload.source = 'dhlottery-official-with-mirror-fallback';
  payload.fetched_at = new Date().toISOString();
  payload.verified_at = new Date().toISOString();
  payload.schema_version = 1;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(`Saved through draw ${payload.latest_draw} to ${OUT}`);
}

main().catch(error => { console.error(error); process.exit(1); });
