(() => {
  const BUNDLED_DATA = './data/lotto-history.json';
  const REMOTE_BASE = 'https://smok95.github.io/lotto/results';
  const CACHE_KEY = 'lotto-signal-lab-history-v1';
  const $ = selector => document.querySelector(selector);
  const elements = {
    start: $('#startButton'), rerun: $('#rerunButton'), dashboard: $('#dashboard'), progress: $('#progressPanel'),
    results: $('#results'), progressBar: $('#progressBar'), progressPercent: $('#progressPercent'), progressStage: $('#progressStage')
  };
  let historyPayload = null;
  let analysisRunning = false;
  let selectedIterations = 250000;
  let displayedDrawNo = null;

  function formatMoney(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`;
    if (value >= 10000) return `${Math.round(value / 10000).toLocaleString('ko-KR')}만원`;
    return `${value.toLocaleString('ko-KR')}원`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '—';
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function ballClass(number) { return `range-${Math.ceil(number / 10)}`; }
  function makeBall(number, className = 'ball') {
    return `<span class="${className} ${ballClass(number)}">${number}</span>`;
  }

  function setConnection(type, message) {
    $('#statusDot').className = `status-dot ${type}`;
    $('#headerStatus').textContent = message;
  }

  function renderLatest(draw) {
    displayedDrawNo = draw.draw_no;
    const isLatest = historyPayload && draw.draw_no === historyPayload.latest_draw;
    $('#drawLabel').textContent = isLatest ? 'LATEST VERIFIED DRAW' : 'HISTORICAL DRAW ARCHIVE';
    $('#latestRound').textContent = draw.draw_no.toLocaleString('ko-KR');
    $('#latestDate').textContent = formatDate(draw.date);
    $('#latestBalls').innerHTML = draw.numbers.map(number => makeBall(number)).join('');
    $('#bonusBall').textContent = draw.bonus_no;
    const first = draw.divisions?.[0];
    $('#firstWinners').textContent = first?.winners ? `${first.winners.toLocaleString('ko-KR')}명` : '—';
    $('#firstPrize').textContent = first?.prize ? formatMoney(first.prize) : '—';
    $('#historyInput').value = draw.draw_no;
    $('#historyInput').max = historyPayload?.latest_draw || draw.draw_no;
    $('#previousDrawButton').disabled = draw.draw_no <= 1;
    $('#nextDrawButton').disabled = !historyPayload || draw.draw_no >= historyPayload.latest_draw;
  }

  function showDraw(drawNo) {
    if (!historyPayload) return;
    const safeDrawNo = Math.max(1, Math.min(historyPayload.latest_draw, Number(drawNo) || historyPayload.latest_draw));
    const draw = historyPayload.draws.find(item => item.draw_no === safeDrawNo);
    if (draw) renderLatest(draw);
  }

  function readLocalCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY));
      return parsed?.draws?.length ? parsed : null;
    } catch { return null; }
  }

  function writeLocalCache(payload) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); }
    catch (error) { console.warn('브라우저 캐시 저장 생략:', error.message); }
  }

  async function fetchJson(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  async function loadData() {
    setConnection('', '저장 데이터 확인 중');
    const local = readLocalCache();
    let bundled = null;
    try { bundled = await fetchJson(BUNDLED_DATA); }
    catch (error) { console.warn('번들 데이터 로드 실패:', error.message); }

    historyPayload = [local, bundled].filter(Boolean).sort((a, b) => b.latest_draw - a.latest_draw)[0];
    if (!historyPayload) throw new Error('저장된 로또 데이터를 찾을 수 없습니다.');
    renderLatest(historyPayload.draws[historyPayload.draws.length - 1]);
    setConnection('cached', `${historyPayload.latest_draw}회 저장 데이터`);
    $('#dataSource').textContent = `로컬 저장본 · ${historyPayload.latest_draw}회까지`;
    elements.start.disabled = false;

    try {
      const latest = await fetchJson(`${REMOTE_BASE}/latest.json`);
      if (latest.draw_no > historyPayload.latest_draw) {
        const additions = [];
        for (let drawNo = historyPayload.latest_draw + 1; drawNo <= latest.draw_no; drawNo++) {
          additions.push(await fetchJson(`${REMOTE_BASE}/${drawNo}.json`));
        }
        historyPayload = {
          source: REMOTE_BASE,
          fetched_at: new Date().toISOString(),
          latest_draw: latest.draw_no,
          draws: [...historyPayload.draws, ...additions].sort((a, b) => a.draw_no - b.draw_no)
        };
      }
      writeLocalCache(historyPayload);
      renderLatest(historyPayload.draws[historyPayload.draws.length - 1]);
      setConnection('live', `최신 ${historyPayload.latest_draw}회 연결`);
      $('#dataSource').textContent = `온라인 최신 확인 · ${historyPayload.latest_draw}회 · 브라우저 백업 완료`;
    } catch (error) {
      console.warn('온라인 최신 확인 실패, 저장 데이터 사용:', error.message);
      setConnection('cached', `오프라인 저장본 ${historyPayload.latest_draw}회`);
      $('#dataSource').textContent = `오프라인 저장본 · ${historyPayload.latest_draw}회까지`;
    }
  }

  function updateProgress(value, stage) {
    const percent = Math.round(value * 100);
    elements.progressBar.style.width = `${percent}%`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressStage.textContent = stage;
    const steps = [...document.querySelectorAll('.process-grid span')];
    steps.forEach((step, index) => step.classList.toggle('active', value >= [0.02, 0.12, 0.2, 0.93][index]));
  }

  function runSimulationOffThread(iterations) {
    if (!window.Worker) {
      return LottoEngine.runSimulation(historyPayload.draws, iterations, {
        chunkSize: iterations >= 500000 ? 5000 : 2500,
        onProgress: progress => updateProgress(0.18 + progress * 0.74, `가중 모의 추첨 ${Math.round(progress * iterations).toLocaleString('ko-KR')} / ${iterations.toLocaleString('ko-KR')}`)
      });
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker('simulation-worker.js');
      worker.onmessage = event => {
        if (event.data.type === 'progress') {
          const progress = event.data.progress;
          updateProgress(0.18 + progress * 0.74, `가중 모의 추첨 ${Math.round(progress * iterations).toLocaleString('ko-KR')} / ${iterations.toLocaleString('ko-KR')}`);
        } else if (event.data.type === 'complete') {
          worker.terminate();
          resolve(event.data.report);
        } else if (event.data.type === 'error') {
          worker.terminate();
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = error => { worker.terminate(); reject(new Error(error.message || 'Worker 실행 오류')); };
      worker.postMessage({ draws: historyPayload.draws, iterations });
    });
  }

  async function analyze() {
    if (analysisRunning || !historyPayload) return;
    analysisRunning = true;
    elements.dashboard.classList.remove('hidden');
    elements.progress.classList.remove('hidden');
    elements.results.classList.add('hidden');
    elements.start.disabled = true;
    elements.rerun.disabled = true;
    document.querySelectorAll('.mode-option').forEach(button => { button.disabled = true; });
    updateProgress(0.03, '역대 당첨 이력 검증');
    elements.dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const started = performance.now();

    await new Promise(resolve => setTimeout(resolve, 350));
    updateProgress(0.14, '빈도·간격 가중치 계산');
    await new Promise(resolve => setTimeout(resolve, 250));

    try {
      $('#reportIterations').textContent = selectedIterations.toLocaleString('ko-KR');
      const report = await runSimulationOffThread(selectedIterations);
      updateProgress(0.96, '상위 조합 교차 검증');
      await new Promise(resolve => setTimeout(resolve, 350));
      renderReport(report, performance.now() - started);
      updateProgress(1, '분석 완료');
      await new Promise(resolve => setTimeout(resolve, 250));
      elements.progress.classList.add('hidden');
      elements.results.classList.remove('hidden');
    } catch (error) {
      console.error(error);
      elements.progressStage.textContent = `분석 실패: ${error.message}`;
    } finally {
      analysisRunning = false;
      elements.start.disabled = false;
      elements.rerun.disabled = false;
      document.querySelectorAll('.mode-option').forEach(button => { button.disabled = false; });
    }
  }

  function modelScore(candidate) { return Math.min(99.9, Math.max(0, candidate.score * 72)); }

  function renderReport(report, elapsedMs) {
    const primary = report.topSets[0];
    $('#drawCount').textContent = `${report.stats.draws.length.toLocaleString('ko-KR')}개 회차`;
    $('#analysisTime').textContent = `${(elapsedMs / 1000).toFixed(2)}초`;
    $('#primaryNumbers').innerHTML = primary.numbers.map((number, index) => `<span class="result-ball" style="animation-delay:${index * 55}ms">${number}</span>`).join('');
    $('#primaryScore').textContent = `${modelScore(primary).toFixed(1)} / 100`;
    $('#primaryAppearances').textContent = `${primary.appearances.toLocaleString('ko-KR')}회 / ${report.iterations.toLocaleString('ko-KR')}`;

    $('#setGrid').innerHTML = report.topSets.map((set, index) => `
      <article class="set-card" data-numbers="${set.numbers.join(', ')}" tabindex="0" role="button" aria-label="추천 ${index + 1}위 번호 복사">
        <header><strong>RANK ${String(index + 1).padStart(2, '0')}</strong><span>MODEL ${modelScore(set).toFixed(1)}</span></header>
        <div class="mini-balls">${set.numbers.map(number => `<span class="mini-ball">${number}</span>`).join('')}</div>
        <div class="set-foot"><span>SIM ${set.appearances} HIT</span><span>클릭하여 번호 복사</span></div>
      </article>`).join('');

    const top12 = report.numberRanking.slice(0, 12);
    const maxRate = top12[0].simulationRate;
    $('#numberTable').innerHTML = top12.map((item, index) => `
      <div class="number-row">
        <span class="rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="table-ball">${item.number}</span>
        <span class="signal-bar"><i style="width:${item.simulationRate / maxRate * 100}%"></i></span>
        <span>${item.simulationRate.toFixed(2)}%</span>
        <span class="signal-tag ${item.signal.toLowerCase()}">${item.signal}</span>
      </div>`).join('');

    const numbers = primary.numbers;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const odd = numbers.filter(number => number % 2).length;
    const low = numbers.filter(number => number <= 22).length;
    let consecutive = 0;
    for (let i = 1; i < numbers.length; i++) if (numbers[i] === numbers[i - 1] + 1) consecutive++;
    $('#sumValue').textContent = sum;
    $('#oddEven').textContent = `${odd} : ${6 - odd}`;
    $('#lowHigh').textContent = `${low} : ${6 - low}`;
    $('#consecutive').textContent = `${consecutive}쌍`;
    $('#historyTotal').textContent = `${report.stats.draws.length.toLocaleString('ko-KR')}회`;
    $('#summaryRing').style.setProperty('--ring', `${Math.min(94, sum / 220 * 100)}%`);

    const frequencies = report.stats.frequency.slice(1);
    const maxFrequency = Math.max(...frequencies);
    const averageFrequency = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    $('#frequencyChart').innerHTML = frequencies.map((frequency, index) => {
      const height = Math.max(5, frequency / maxFrequency * 100);
      return `<div class="freq-item ${frequency >= averageFrequency ? 'hot' : ''}" style="--h:${height * 2.3}px"><b>${frequency}</b><i style="height:${height}%"></i><span>${index + 1}</span></div>`;
    }).join('');

    document.querySelectorAll('.set-card').forEach(card => {
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(card.dataset.numbers);
          const foot = card.querySelector('.set-foot span:last-child');
          foot.textContent = '복사 완료';
          setTimeout(() => foot.textContent = '클릭하여 번호 복사', 1200);
        } catch { /* clipboard may be unavailable on file:// */ }
      };
      card.addEventListener('click', copy);
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') copy(); });
    });
  }

  const durationHints = { 50000: '약 1초', 100000: '약 2초', 250000: '약 5초', 500000: '약 10–20초', 1000000: '약 20초 이상' };
  document.querySelectorAll('.mode-option').forEach(button => {
    button.addEventListener('click', () => {
      selectedIterations = Number(button.dataset.iterations);
      document.querySelectorAll('.mode-option').forEach(item => item.classList.toggle('selected', item === button));
      $('#modeWarning').classList.toggle('hidden', selectedIterations !== 1000000);
      $('.hero-note').textContent = `예상 분석시간 ${durationHints[selectedIterations]}`;
      $('#reportIterations').textContent = selectedIterations.toLocaleString('ko-KR');
    });
  });

  $('#viewDrawButton').addEventListener('click', () => showDraw($('#historyInput').value));
  $('#historyInput').addEventListener('keydown', event => { if (event.key === 'Enter') showDraw(event.currentTarget.value); });
  $('#previousDrawButton').addEventListener('click', () => showDraw(displayedDrawNo - 1));
  $('#nextDrawButton').addEventListener('click', () => showDraw(displayedDrawNo + 1));
  $('#latestDrawButton').addEventListener('click', () => showDraw(historyPayload?.latest_draw));
  $('#randomDrawButton').addEventListener('click', () => { if (historyPayload) showDraw(Math.floor(Math.random() * historyPayload.latest_draw) + 1); });

  elements.start.addEventListener('click', analyze);
  elements.rerun.addEventListener('click', analyze);
  loadData().catch(error => {
    console.error(error);
    setConnection('', '데이터 로드 실패');
    $('#dataSource').textContent = error.message;
    elements.start.textContent = '데이터를 불러오지 못했습니다';
  });
})();
