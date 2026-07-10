(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LottoEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_NUMBER = 45;
  const PICK_COUNT = 6;
  const COMBINATION_ODDS = 8145060;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function average(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
  function stddev(values) {
    const mean = average(values);
    return Math.sqrt(average(values.map(value => (value - mean) ** 2))) || 1;
  }

  function calculateStats(inputDraws) {
    const draws = [...inputDraws].sort((a, b) => a.draw_no - b.draw_no);
    if (!draws.length) throw new Error('당첨 이력이 없습니다.');
    const frequency = Array(MAX_NUMBER + 1).fill(0);
    const recentFrequency = Array(MAX_NUMBER + 1).fill(0);
    const lastSeen = Array(MAX_NUMBER + 1).fill(0);
    const pairFrequency = new Map();
    const recentStart = Math.max(0, draws.length - 52);

    draws.forEach((draw, drawIndex) => {
      const numbers = [...draw.numbers].sort((a, b) => a - b);
      numbers.forEach(number => {
        frequency[number] += 1;
        lastSeen[number] = draw.draw_no;
        if (drawIndex >= recentStart) recentFrequency[number] += 1;
      });
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const key = `${numbers[i]}-${numbers[j]}`;
          pairFrequency.set(key, (pairFrequency.get(key) || 0) + 1);
        }
      }
    });

    const latestDraw = draws[draws.length - 1];
    const values = frequency.slice(1);
    const recentValues = recentFrequency.slice(1);
    const freqMean = average(values);
    const freqStd = stddev(values);
    const recentMean = average(recentValues);
    const recentStd = stddev(recentValues);
    const weights = Array(MAX_NUMBER + 1).fill(0);
    const details = [];

    for (let number = 1; number <= MAX_NUMBER; number++) {
      const gap = latestDraw.draw_no - lastSeen[number];
      const longZ = (frequency[number] - freqMean) / freqStd;
      const recentZ = (recentFrequency[number] - recentMean) / recentStd;
      const gapSignal = clamp((gap - 6.5) / 11, -0.75, 1.25);
      const blended = 1 + longZ * 0.075 + recentZ * 0.105 + gapSignal * 0.06;
      weights[number] = clamp(blended, 0.72, 1.32);
      details.push({
        number,
        frequency: frequency[number],
        recentFrequency: recentFrequency[number],
        gap,
        longZ,
        recentZ,
        weight: weights[number],
        signal: recentZ > 0.7 ? 'HOT' : gap > 14 ? 'OVERDUE' : longZ < -0.8 ? 'COLD' : 'NEUTRAL'
      });
    }

    return { draws, latestDraw, frequency, recentFrequency, lastSeen, pairFrequency, weights, details, combinationOdds: COMBINATION_ODDS };
  }

  function weightedSample(weights, random = Math.random) {
    const candidates = Array.from({ length: MAX_NUMBER }, (_, index) => index + 1);
    const selected = [];
    for (let pick = 0; pick < PICK_COUNT; pick++) {
      let total = candidates.reduce((sum, number) => sum + weights[number], 0);
      let cursor = random() * total;
      let chosenIndex = 0;
      for (let i = 0; i < candidates.length; i++) {
        cursor -= weights[candidates[i]];
        if (cursor <= 0) { chosenIndex = i; break; }
      }
      selected.push(candidates.splice(chosenIndex, 1)[0]);
    }
    return selected.sort((a, b) => a - b);
  }

  function structureScore(numbers) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    const odd = numbers.filter(n => n % 2).length;
    const low = numbers.filter(n => n <= 22).length;
    let consecutive = 0;
    for (let i = 1; i < numbers.length; i++) if (numbers[i] === numbers[i - 1] + 1) consecutive++;
    const sumScore = Math.exp(-((sum - 138) ** 2) / (2 * 31 ** 2));
    const oddScore = odd >= 2 && odd <= 4 ? 1 : 0.45;
    const lowScore = low >= 2 && low <= 4 ? 1 : 0.5;
    const consecutiveScore = consecutive <= 2 ? 1 : 0.35;
    return sumScore * 0.42 + oddScore * 0.24 + lowScore * 0.22 + consecutiveScore * 0.12;
  }

  function candidateScore(numbers, stats) {
    const numberScore = average(numbers.map(number => stats.weights[number]));
    const expectedPair = stats.draws.length * 15 / 990;
    const pairScores = [];
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        pairScores.push((stats.pairFrequency.get(`${numbers[i]}-${numbers[j]}`) || 0) / Math.max(1, expectedPair));
      }
    }
    const pairScore = clamp(average(pairScores), 0.55, 1.7);
    return numberScore * 0.55 + pairScore * 0.18 + structureScore(numbers) * 0.27;
  }

  function overlap(a, b) { return a.filter(number => b.includes(number)).length; }

  async function runSimulation(inputDraws, iterations = 50000, options = {}) {
    const stats = calculateStats(inputDraws);
    const counts = Array(MAX_NUMBER + 1).fill(0);
    const candidates = new Map();
    const chunkSize = options.chunkSize || 1250;
    const random = options.random || Math.random;

    for (let start = 0; start < iterations; start += chunkSize) {
      const end = Math.min(iterations, start + chunkSize);
      for (let index = start; index < end; index++) {
        const numbers = weightedSample(stats.weights, random);
        numbers.forEach(number => counts[number]++);
        const key = numbers.join('-');
        const score = candidateScore(numbers, stats);
        const previous = candidates.get(key);
        if (!previous || score > previous.score) candidates.set(key, { numbers, score, appearances: (previous?.appearances || 0) + 1 });
        else previous.appearances++;
      }
      if (options.onProgress) options.onProgress(end / iterations);
      if (end < iterations) await new Promise(resolve => setTimeout(resolve, 0));
    }

    const ranked = [...candidates.values()].sort((a, b) => (b.score + b.appearances * 0.0005) - (a.score + a.appearances * 0.0005));
    const topSets = [];
    for (const candidate of ranked) {
      if (topSets.every(existing => overlap(existing.numbers, candidate.numbers) <= 4)) topSets.push(candidate);
      if (topSets.length === 5) break;
    }

    const numberRanking = Array.from({ length: MAX_NUMBER }, (_, index) => ({
      number: index + 1,
      count: counts[index + 1],
      simulationRate: counts[index + 1] / iterations * 100,
      ...stats.details[index]
    })).sort((a, b) => b.count - a.count);

    return { iterations, stats, topSets, numberRanking, counts };
  }

  return { calculateStats, weightedSample, structureScore, candidateScore, runSimulation, COMBINATION_ODDS };
});
