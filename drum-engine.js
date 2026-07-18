(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoDrumEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TAU = Math.PI * 2;

  function createDrumState({ width = 900, height = 620, random = Math.random } = {}) {
    const drum = {
      cx: width * 0.5,
      cy: height * 0.47,
      radius: Math.min(width * 0.34, height * 0.39)
    };
    const ballRadius = Math.max(7, Math.min(13, drum.radius / 18.5));
    const balls = [];
    for (let number = 1; number <= 45; number++) {
      let placed = false;
      for (let attempt = 0; attempt < 1200 && !placed; attempt++) {
        const angle = random() * TAU;
        const radial = Math.sqrt(random()) * (drum.radius - ballRadius * 1.35);
        const x = drum.cx + Math.cos(angle) * radial;
        const y = drum.cy + Math.sin(angle) * radial;
        if (balls.every(ball => Math.hypot(ball.x - x, ball.y - y) >= ballRadius * 2.02)) {
          const speed = 55 + random() * 95;
          const heading = random() * TAU;
          balls.push({
            number, x, y,
            vx: Math.cos(heading) * speed,
            vy: Math.sin(heading) * speed,
            r: ballRadius,
            spin: (random() - 0.5) * 5,
            angle: random() * TAU,
            active: true
          });
          placed = true;
        }
      }
      if (!placed) {
        const angle = number / 45 * TAU;
        const radial = (drum.radius - ballRadius * 2) * (0.35 + (number % 5) * 0.1);
        balls.push({ number, x: drum.cx + Math.cos(angle) * radial, y: drum.cy + Math.sin(angle) * radial, vx: 0, vy: 0, r: ballRadius, spin: 0, angle: 0, active: true });
      }
    }
    return { width, height, drum, balls, random, time: 0 };
  }

  function isBallInsideDrum(state, ball) {
    return Math.hypot(ball.x - state.drum.cx, ball.y - state.drum.cy) <= state.drum.radius - ball.r + 0.001;
  }

  function resolveBoundary(state, ball) {
    const dx = ball.x - state.drum.cx;
    const dy = ball.y - state.drum.cy;
    const distance = Math.hypot(dx, dy) || 1;
    const limit = state.drum.radius - ball.r;
    if (distance <= limit) return;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = state.drum.cx + nx * limit;
    ball.y = state.drum.cy + ny * limit;
    const outward = ball.vx * nx + ball.vy * ny;
    if (outward > 0) {
      ball.vx -= 1.82 * outward * nx;
      ball.vy -= 1.82 * outward * ny;
    }
  }

  function resolvePair(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDistance = a.r + b.r;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= minDistance * minDistance) return;
    const distance = Math.sqrt(distanceSq) || 0.001;
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relative >= 0) return;
    const impulse = -relative * 0.92;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }

  function stepDrum(state, dt = 1 / 60, { agitation = 1 } = {}) {
    const safeDt = Math.min(1 / 24, Math.max(0.001, dt));
    state.time += safeDt;
    const active = state.balls.filter(ball => ball.active);
    for (const ball of active) {
      const dx = ball.x - state.drum.cx;
      const dy = ball.y - state.drum.cy;
      const distance = Math.hypot(dx, dy) || 1;
      const tangentX = -dy / distance;
      const tangentY = dx / distance;
      const pulse = Math.sin(state.time * 3.7 + ball.number * 0.83);
      const swirl = agitation * (175 + pulse * 65);
      ball.vx += (tangentX * swirl + Math.cos(state.time * 5 + ball.number) * 80 * agitation) * safeDt;
      ball.vy += (tangentY * swirl + Math.sin(state.time * 4.2 + ball.number * 1.7) * 75 * agitation + 44) * safeDt;
      ball.vx *= 0.996;
      ball.vy *= 0.996;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 360) {
        ball.vx *= 360 / speed;
        ball.vy *= 360 / speed;
      }
      ball.x += ball.vx * safeDt;
      ball.y += ball.vy * safeDt;
      ball.angle += ball.spin * safeDt;
      resolveBoundary(state, ball);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) resolvePair(active[i], active[j]);
      }
      active.forEach(ball => resolveBoundary(state, ball));
    }
    return state;
  }

  function gateCandidate(state) {
    const gateX = state.drum.cx;
    const gateY = state.drum.cy + state.drum.radius;
    return state.balls.filter(ball => ball.active).sort((a, b) => {
      const scoreA = Math.hypot(a.x - gateX, (a.y - gateY) * 0.72) - a.vy * 0.035;
      const scoreB = Math.hypot(b.x - gateX, (b.y - gateY) * 0.72) - b.vy * 0.035;
      return scoreA - scoreB || a.number - b.number;
    })[0];
  }

  function extractGateBall(state) {
    const ball = gateCandidate(state);
    if (!ball) return null;
    ball.active = false;
    return ball.number;
  }

  function simulatePhysicalDraw({ random = Math.random, warmupSteps = 540, stepsBetween = 180 } = {}) {
    const state = createDrumState({ random });
    for (let i = 0; i < warmupSteps; i++) stepDrum(state, 1 / 60, { agitation: 1 });
    const numbers = [];
    while (numbers.length < 6) {
      const number = extractGateBall(state);
      if (number == null) break;
      numbers.push(number);
      for (let i = 0; i < stepsBetween; i++) stepDrum(state, 1 / 60, { agitation: 0.92 });
    }
    return numbers;
  }

  return { createDrumState, stepDrum, isBallInsideDrum, extractGateBall, simulatePhysicalDraw };
});
