(() => {
  const canvas = document.getElementById('lottoDrumCanvas');
  const button = document.getElementById('drumStartButton');
  const status = document.getElementById('drumStatus');
  const rail = document.getElementById('drawnBallRail');
  if (!canvas || !button || !window.LottoDrumEngine) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = ['#f0ce63', '#70abd0', '#df7b69', '#a9abb1', '#70b180'];
  const engine = window.LottoDrumEngine;
  let drumState = createFreshState();
  let phase = 'idle';
  let phaseStart = performance.now();
  let nextExtraction = Infinity;
  let extracted = [];
  let ejecting = [];
  let running = true;
  let lastFrame = performance.now();

  function seededRandomFromCrypto() {
    const seedBox = new Uint32Array(1);
    crypto.getRandomValues(seedBox);
    let state = seedBox[0] || 0x9e3779b9;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function createFreshState() {
    return engine.createDrumState({ width: W, height: H, random: seededRandomFromCrypto() });
  }

  function ballColor(number) {
    return palette[Math.min(4, Math.floor((number - 1) / 10))];
  }

  function resetRail() {
    rail.innerHTML = '<span>—</span><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>';
  }

  function commitToRail(item) {
    if (item.committed) return;
    item.committed = true;
    const slot = rail.children[item.index];
    slot.textContent = item.number;
    slot.style.setProperty('--ball-color', ballColor(item.number));
    slot.classList.add('revealed');
    if (navigator.vibrate) navigator.vibrate(18);
  }

  function startDraw() {
    drumState = createFreshState();
    extracted = [];
    ejecting = [];
    resetRail();
    phase = 'mixing';
    phaseStart = performance.now();
    nextExtraction = Infinity;
    button.disabled = true;
    button.querySelector('span').textContent = '45개 공 혼합 중';
    status.textContent = 'MIXING · TURBULENCE 100%';
    document.getElementById('drumStudio').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  button.addEventListener('click', startDraw);

  function update(now, dt) {
    const agitation = phase === 'mixing' ? 1 : phase === 'extracting' ? 0.88 : phase === 'complete' ? 0.18 : 0.34;
    const substeps = phase === 'mixing' ? 2 : 1;
    for (let i = 0; i < substeps; i++) engine.stepDrum(drumState, dt / substeps, { agitation });

    const mixDuration = reducedMotion ? 1800 : 3600;
    const extractGap = reducedMotion ? 850 : 1350;
    if (phase === 'mixing' && now - phaseStart >= mixDuration) {
      phase = 'extracting';
      nextExtraction = now + 250;
      status.textContent = 'GATE ARMED · SELECTING BALL 1';
    }

    if (phase === 'extracting' && extracted.length < 6 && now >= nextExtraction) {
      const number = engine.extractGateBall(drumState);
      if (number != null) {
        const source = drumState.balls.find(ball => ball.number === number);
        const item = { number, index: extracted.length, start: now, x: source.x, y: source.y, committed: false };
        extracted.push(number);
        ejecting.push(item);
        status.textContent = `GATE OPEN · BALL ${extracted.length} / 6`;
        nextExtraction = now + extractGap;
      }
    }

    ejecting.forEach(item => {
      if (!item.committed && now - item.start > 720) commitToRail(item);
    });
    ejecting = ejecting.filter(item => now - item.start < 1050);

    if (phase === 'extracting' && extracted.length === 6 && ejecting.every(item => item.committed) && now > nextExtraction - (reducedMotion ? 200 : 500)) {
      phase = 'complete';
      status.textContent = `DRAW COMPLETE · ${extracted.join(' · ')}`;
      button.disabled = false;
      button.querySelector('span').textContent = '새 물리 추첨 시작';
    }
  }

  function drawBackground(now) {
    const gradient = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.5, 520);
    gradient.addColorStop(0, '#242a31');
    gradient.addColorStop(0.52, '#11151a');
    gradient.addColorStop(1, '#06080a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#9fa6af';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 45) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 45) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    const beam = ctx.createLinearGradient(0, 0, W, H);
    beam.addColorStop(0.2, 'rgba(255,255,255,0)');
    beam.addColorStop(0.48, `rgba(235,222,185,${0.025 + Math.sin(now * 0.0008) * 0.009})`);
    beam.addColorStop(0.7, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMachine() {
    const { cx, cy, radius } = drumState.drum;
    ctx.save();
    ctx.lineCap = 'round';

    ctx.strokeStyle = '#252a30';
    ctx.lineWidth = 28;
    ctx.beginPath(); ctx.moveTo(cx - radius * 0.72, cy + radius * 0.72); ctx.lineTo(cx - radius * 0.94, H - 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + radius * 0.72, cy + radius * 0.72); ctx.lineTo(cx + radius * 0.94, H - 16); ctx.stroke();
    ctx.strokeStyle = '#5d626a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - radius * 0.94, H - 16); ctx.lineTo(cx + radius * 0.94, H - 16); ctx.stroke();

    ctx.shadowColor = '#000'; ctx.shadowBlur = 35;
    ctx.fillStyle = '#0a0d10'; ctx.beginPath(); ctx.arc(cx, cy, radius + 24, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    const ring = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ring.addColorStop(0, '#797f87'); ring.addColorStop(0.28, '#1a1e23'); ring.addColorStop(0.55, '#858b91'); ring.addColorStop(0.8, '#24292f'); ring.addColorStop(1, '#5a6067');
    ctx.strokeStyle = ring; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d7bb79'; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2); ctx.clip();
    const glass = ctx.createRadialGradient(cx - radius * 0.28, cy - radius * 0.36, 10, cx, cy, radius);
    glass.addColorStop(0, 'rgba(99,125,142,.2)'); glass.addColorStop(0.62, 'rgba(18,28,35,.13)'); glass.addColorStop(1, 'rgba(4,7,9,.5)');
    ctx.fillStyle = glass; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.translate(cx, cy);
    ctx.rotate(drumState.time * 0.72);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      const paddle = ctx.createLinearGradient(0, 0, radius * .62, 0);
      paddle.addColorStop(0, 'rgba(218,184,108,.5)'); paddle.addColorStop(1, 'rgba(218,184,108,.06)');
      ctx.fillStyle = paddle;
      ctx.beginPath(); ctx.roundRect(18, -5, radius * .57, 10, 5); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawBall(ball, x = ball.x, y = ball.y, scale = 1) {
    const r = ball.r * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ball.angle || 0);
    ctx.shadowColor = '#000b'; ctx.shadowBlur = r * .8; ctx.shadowOffsetY = r * .38;
    const gradient = ctx.createRadialGradient(-r * .35, -r * .45, r * .08, 0, 0, r);
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.12, ballColor(ball.number)); gradient.addColorStop(0.72, ballColor(ball.number)); gradient.addColorStop(1, '#30343a');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#111319'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(8, r * .82)}px IBM Plex Mono, monospace`; ctx.fillText(ball.number, 0, .5);
    ctx.restore();
  }

  function drawBalls() {
    const active = drumState.balls.filter(ball => ball.active).sort((a, b) => a.y - b.y);
    active.forEach(ball => drawBall(ball));
  }

  function drawGate(now) {
    const { cx, cy, radius } = drumState.drum;
    const gateY = cy + radius - 2;
    const open = phase === 'extracting' && extracted.length < 6 && nextExtraction - now < 330;
    ctx.save();
    ctx.fillStyle = '#171b20'; ctx.strokeStyle = open ? '#f1c86f' : '#656b73'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(cx - 34, gateY - 12, 68, 35, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = open ? '#f2cd78' : '#3d4249'; ctx.fillRect(cx - 22, gateY + 18, 44, 9);
    ctx.strokeStyle = '#777d84'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(cx, gateY + 28); ctx.bezierCurveTo(cx, gateY + 58, cx + 55, H - 58, cx + 140, H - 45); ctx.stroke();
    ctx.strokeStyle = '#24282d'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
  }

  function drawEjections(now) {
    const { cx, cy, radius } = drumState.drum;
    ejecting.forEach(item => {
      const p = Math.min(1, (now - item.start) / 790);
      let x, y;
      if (p < 0.34) {
        const q = p / 0.34;
        x = item.x + (cx - item.x) * q;
        y = item.y + (cy + radius + 20 - item.y) * q;
      } else {
        const q = (p - 0.34) / 0.66;
        x = cx + 140 * q;
        y = cy + radius + 20 + 54 * q + 42 * q * q;
      }
      drawBall({ number: item.number, r: 16, angle: p * 11 }, x, y, 1 + Math.sin(p * Math.PI) * .12);
    });
  }

  function drawTelemetry() {
    ctx.save();
    ctx.font = '10px IBM Plex Mono, monospace'; ctx.fillStyle = '#777d85';
    ctx.fillText(`RPM ${phase === 'mixing' ? '42.8' : phase === 'extracting' ? '31.4' : '12.0'}`, 28, 33);
    ctx.fillText(`BALLS ${String(drumState.balls.filter(ball => ball.active).length).padStart(2, '0')}`, 28, 51);
    ctx.textAlign = 'right'; ctx.fillStyle = phase === 'mixing' ? '#edc875' : '#7d838b';
    ctx.fillText(phase.toUpperCase(), W - 28, 33);
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.035, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (running && !document.hidden) update(now, dt);
    drawBackground(now);
    drawMachine();
    drawBalls();
    drawGate(now);
    drawEjections(now);
    drawTelemetry();
    requestAnimationFrame(frame);
  }

  const observer = new IntersectionObserver(entries => { running = entries[0].isIntersecting || phase === 'mixing' || phase === 'extracting'; }, { rootMargin: '250px' });
  observer.observe(canvas);
  requestAnimationFrame(frame);
})();
