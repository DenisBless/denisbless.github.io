/* ============================================================
   Blog widget: annealed / tempered overdamped Langevin.

   Temper the target with an inverse temperature β:
       p_β(x) ∝ p̃(x)^β = exp(β · log p̃(x)),
   whose score is β · ∇log p̃(x). At β→0 the landscape is flat
   (every barrier gone); at β=1 it is the true target. We run plain
   overdamped ULA while ANNEALING β from ~0 up to 1:
       x += h · β · ∇log p̃(x) + sqrt(2h) · ξ.
   The heatmap is recomputed as p_β every frame, so it visibly
   flattens when hot and sharpens back to the target when cold.
   β cycles 0→1 repeatedly (a re-anneal loop).

   Controls: an "annealing speed" slider (steps taken to go from
   β≈0 to β=1 — slow = honest, fast = wrong mode weights) and a
   particle slider. A live β / T=1/β readout sits in the readout slot.
   The mixture is editable: drag / click-add / dbl-click.

   Honest caveat (mirrored in the post): plain annealing is a
   HEURISTIC with no exactness guarantee. The population tracks the
   *tempered* mass, which under-weights narrow modes, and anneal too
   fast and the particles can't keep up with the moving target —
   the final mode weights come out wrong.

   Mount points: any element with data-widget="annealed-langevin".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'annealed-langevin';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;
  const MAX_PARTICLES = 500;
  const MAX_MODES = 8;
  const C = 0.18;                 // dimensionless step: h = sigma^2 * C
  const BMIN = 0.02;              // hottest inverse temperature (β floor)
  // annealing length in steps: low slider = fast (few steps to β=1), high = slow.
  const S_MIN = 18, S_MAX = 2200;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MODES_N = [
    { x: 0.20, y: 0.64, w: 1.0, s: 1.00 },
    { x: 0.52, y: 0.30, w: 1.3, s: 0.80 },
    { x: 0.82, y: 0.68, w: 0.9, s: 1.15 },
  ];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }

  function mount(host) {
    if (host.dataset.mounted) return;
    host.dataset.mounted = '1';
    host.innerHTML = '';

    // ---- DOM ----
    const canvas = document.createElement('canvas');
    canvas.className = 'ld-canvas';

    const controls = document.createElement('div');
    controls.className = 'ld-controls-col';

    // row 1: annealing speed + live β/T readout
    const row1 = document.createElement('div');
    row1.className = 'ld-row';
    const sLabel = document.createElement('label');
    sLabel.className = 'mono ld-label';
    const sSlider = document.createElement('input');
    sSlider.type = 'range'; sSlider.min = '0'; sSlider.max = '100';
    sSlider.value = '78'; sSlider.className = 'ld-slider';
    sSlider.setAttribute('aria-label', 'annealing speed');
    row1.append(sLabel, sSlider);

    const row2 = document.createElement('div');
    row2.className = 'ld-row';
    const betaReadout = document.createElement('span');
    betaReadout.className = 'ld-acc mono';
    row2.append(betaReadout);

    // row 3: particle count
    const row3 = document.createElement('div');
    row3.className = 'ld-row';
    const pLabel = document.createElement('label');
    pLabel.className = 'mono ld-label';
    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = '1'; pSlider.max = String(MAX_PARTICLES);
    pSlider.value = '160'; pSlider.className = 'ld-slider';
    pSlider.setAttribute('aria-label', 'number of particles');
    row3.append(pLabel, pSlider);

    controls.append(row1, row2, row3);

    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'The heatmap <i>is</i> the tempered density <b>p<sub>β</sub></b>: it melts flat when ' +
      '<b>hot</b> (β→0) and sharpens back to the target when <b>cold</b> (β→1), looping. ' +
      'While it is flat, particles <b>roam and cross between modes</b> — the win ULA and ' +
      'MALA never had. But push <b>annealing speed</b> to <b>fast</b> and the particles ' +
      'cannot keep up with the moving target: they freeze wherever they happened to be, and ' +
      'the final mode weights come out <b>wrong</b>. Editable mixture — drag a mode, click ' +
      'to add, double-click to remove.';

    host.append(canvas, controls, caption);

    // ---- state ----
    const ctx = canvas.getContext('2d');
    const trail = document.createElement('canvas');
    const trailCtx = trail.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let particles = [];
    let count = parseInt(pSlider.value, 10);
    let annealSteps = sFromSlider(parseInt(sSlider.value, 10));
    let clock = 0;                 // counts up; β derived from clock mod the loop length
    let beta = BMIN;
    let running = true;
    let heatDirty = true;          // recomputed every β change (so: every frame while live)
    const logs = new Float64Array(MAX_MODES);
    const g = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }
    function sFromSlider(t) { return Math.round(S_MIN * Math.pow(S_MAX / S_MIN, t / 100)); }

    // β schedule: a re-anneal loop. Ramp BMIN→1 over `annealSteps`, hold cold briefly,
    // then snap hot and ramp again. coldHold ∝ annealSteps so slow schedules also
    // dwell at β=1 long enough to settle.
    function betaAt(c) {
      const coldHold = Math.max(40, Math.round(annealSteps * 0.18));
      const period = annealSteps + coldHold;
      const phase = c % period;
      if (phase >= annealSteps) return 1.0;       // cold hold
      return BMIN + (1.0 - BMIN) * (phase / annealSteps);
    }

    function initModes() {
      const base = sigma();
      modes = MODES_N.map((d) => ({ x: d.x * W, y: d.y * H, w: d.w, rel: d.s, s: base * d.s }));
    }
    function setCount(n) {
      count = n;
      while (particles.length < n) particles.push({ x: Math.random() * W, y: Math.random() * H });
      if (particles.length > n) particles.length = n;
      pLabel.innerHTML = 'particles: <b>' + n + '</b>';
    }
    function setSpeed(t) {
      annealSteps = sFromSlider(t);
      const tag = t < 33 ? 'fast' : (t > 66 ? 'slow' : 'medium');
      sLabel.innerHTML = 'anneal: <b>' + annealSteps + '</b> steps (<b>' + tag + '</b>)';
    }
    function updateBetaReadout() {
      const T = beta > 1e-6 ? (1 / beta) : Infinity;
      const Ttxt = T === Infinity ? '∞' : (T >= 10 ? T.toFixed(0) : T.toFixed(1));
      const state = beta >= 0.999 ? ' — cold, captured' : (beta < 0.15 ? ' — hot, roaming' : '');
      betaReadout.innerHTML = 'β = <b>' + beta.toFixed(2) + '</b>  ·  T = 1/β = <b>' + Ttxt + '</b>' + state;
    }

    // ∇log p̃(x) of the UNTEMPERED mixture, via log-sum-exp, into `out`.
    // (The tempering factor β multiplies this in the integrator.)
    function score(x, y, out) {
      let maxLog = -Infinity;
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i];
        const dx = x - m.x, dy = y - m.y, s2 = m.s * m.s;
        logs[i] = Math.log(m.w) - Math.log(TWO_PI * s2) - (dx * dx + dy * dy) / (2 * s2);
        if (logs[i] > maxLog) maxLog = logs[i];
      }
      let Z = 0;
      for (let i = 0; i < modes.length; i++) { const e = Math.exp(logs[i] - maxLog); logs[i] = e; Z += e; }
      let gx = 0, gy = 0;
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i], r = logs[i] / Z, s2 = m.s * m.s;
        gx += r * (m.x - x) / s2; gy += r * (m.y - y) / s2;
      }
      out.x = gx; out.y = gy;
    }

    // One annealed ULA step:  x += h·β·∇log p̃ + sqrt(2h)·ξ.
    function step() {
      const sig = sigma();
      const h = sig * sig * C;
      const sqrt2h = Math.sqrt(2 * h);
      const hb = h * beta;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        score(p.x, p.y, g);
        p.x += hb * g.x + sqrt2h * randn();
        p.y += hb * g.y + sqrt2h * randn();
        if (p.x < 2) p.x = 2; else if (p.x > W - 2) p.x = W - 2;
        if (p.y < 2) p.y = 2; else if (p.y > H - 2) p.y = H - 2;
      }
    }

    // Heatmap of the TEMPERED density p_β ∝ (Σ w_i N_i)^β, normalised for display.
    function renderHeat() {
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const r = parseInt(cssVar('--heat-r')) || 110;
      const gg = parseInt(cssVar('--heat-g')) || 231;
      const b = parseInt(cssVar('--heat-b')) || 255;
      const hw = heat.width, hh = heat.height;
      const img = heatCtx.createImageData(hw, hh);
      const data = img.data;
      const sx = W / hw, sy = H / hh;
      const vals = new Float64Array(hw * hh);
      let maxV = 1e-12;
      for (let j = 0; j < hh; j++) {
        const y = (j + 0.5) * sy;
        for (let i = 0; i < hw; i++) {
          const x = (i + 0.5) * sx;
          let v = 0;
          for (const m of modes) {
            const dx = x - m.x, dy = y - m.y, s2 = m.s * m.s;
            v += m.w / (TWO_PI * s2) * Math.exp(-(dx * dx + dy * dy) / (2 * s2));
          }
          // temper: p̃^β = exp(β·log p̃). guard the log against underflow.
          v = Math.exp(beta * Math.log(v + 1e-300));
          vals[j * hw + i] = v;
          if (v > maxV) maxV = v;
        }
      }
      const alphaMax = dark ? 80 : 55;
      for (let k = 0; k < vals.length; k++) {
        const v = Math.pow(vals[k] / maxV, 0.62);
        const o = k * 4;
        data[o] = r; data[o + 1] = gg; data[o + 2] = b; data[o + 3] = Math.round(v * alphaMax);
      }
      heatCtx.putImageData(img, 0, 0);
      heatDirty = false;
    }

    function draw() {
      trailCtx.globalCompositeOperation = 'destination-out';
      trailCtx.fillStyle = 'rgba(0,0,0,0.06)';
      trailCtx.fillRect(0, 0, W, H);
      trailCtx.globalCompositeOperation = 'source-over';
      trailCtx.fillStyle = cssVar('--accent') || '#6ee7ff';
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        trailCtx.beginPath();
        trailCtx.arc(p.x, p.y, 1.5, 0, TWO_PI);
        trailCtx.fill();
      }

      ctx.clearRect(0, 0, W, H);
      if (heatDirty) renderHeat();
      ctx.drawImage(heat, 0, 0, W, H);
      ctx.drawImage(trail, 0, 0, W, H);

      // mode rings — drawn at the β-tempered width σ/√β so they breathe with the heatmap.
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.strokeStyle = dark ? 'rgba(232,235,245,0.22)' : 'rgba(24,28,46,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      const tw = 1 / Math.sqrt(Math.max(beta, 1e-3));
      for (const m of modes) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, Math.min(Math.max(W, H), m.s * tw), 0, TWO_PI);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    let tick = 0;
    function frame() {
      if (running && !reduced) {
        clock++;
        beta = betaAt(clock);
        heatDirty = true;          // p_β changes every step → keep the heatmap live
        step();
        draw();
        if ((++tick % 6) === 0) updateBetaReadout();
      }
      requestAnimationFrame(frame);
    }

    function resize() {
      const w = Math.max(280, Math.round(host.clientWidth));
      const h = Math.round(w * 0.6);
      const oldW = W, oldH = H;
      W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, trail]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      heat.width = HEAT_W;
      heat.height = Math.max(2, Math.round(HEAT_W * H / W));
      if (oldW > 0) {
        const ssx = W / oldW, ssy = H / oldH, base = sigma();
        for (const m of modes) { m.x *= ssx; m.y *= ssy; m.s = base * m.rel; }
        for (const p of particles) { p.x *= ssx; p.y *= ssy; }
      }
      if (modes.length === 0) initModes();
      heatDirty = true;
    }

    function staticRender() {
      // freeze a representative cold frame: anneal once to β=1, then settle.
      clock = 0;
      for (let i = 0; i < annealSteps + 200; i++) { clock++; beta = betaAt(clock); step(); }
      beta = 1.0;
      heatDirty = true;
      trailCtx.clearRect(0, 0, W, H);
      draw();
      updateBetaReadout();
    }

    // ---- canvas interaction: drag / add / delete modes ----
    let dragMode = null, downPos = null, downTime = 0, moved = false;
    function hitMode(x, y) {
      for (const m of modes) {
        const dx = x - m.x, dy = y - m.y;
        if (dx * dx + dy * dy < m.s * m.s * 0.9) return m;
      }
      return null;
    }
    function localPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function redrawIfStatic() { if (reduced) draw(); }

    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointerdown', (e) => {
      const p = localPos(e);
      downPos = p; downTime = performance.now(); moved = false;
      dragMode = hitMode(p.x, p.y);
      if (dragMode) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = localPos(e);
      if (downPos && (Math.abs(p.x - downPos.x) > 4 || Math.abs(p.y - downPos.y) > 4)) moved = true;
      if (dragMode) {
        dragMode.x = p.x; dragMode.y = p.y; heatDirty = true;
        e.preventDefault(); redrawIfStatic();
      } else {
        canvas.style.cursor = hitMode(p.x, p.y) ? 'grab' : 'crosshair';
      }
    });
    canvas.addEventListener('pointerup', () => {
      const quickTap = performance.now() - downTime < 350 && !moved;
      if (!dragMode && quickTap && downPos && modes.length < MAX_MODES) {
        const base = sigma(), rel = 0.8 + Math.random() * 0.5;
        modes.push({ x: downPos.x, y: downPos.y, w: 1, rel, s: base * rel });
        heatDirty = true; redrawIfStatic();
      }
      dragMode = null; downPos = null; canvas.style.cursor = 'crosshair';
    });
    canvas.addEventListener('dblclick', (e) => {
      if (modes.length <= 1) return;
      const p = localPos(e);
      const m = hitMode(p.x, p.y);
      if (m) { modes.splice(modes.indexOf(m), 1); heatDirty = true; redrawIfStatic(); }
    });

    // ---- wire up ----
    sSlider.addEventListener('input', () => setSpeed(parseInt(sSlider.value, 10)));
    pSlider.addEventListener('input', () => setCount(parseInt(pSlider.value, 10)));

    if ('ResizeObserver' in window) {
      let t;
      new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => { resize(); if (reduced) staticRender(); }, 120);
      }).observe(host);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((e) => { running = e[0].isIntersecting; }, { threshold: 0.02 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) running = false;
      else if (!('IntersectionObserver' in window)) running = true;
    });
    new MutationObserver(() => {
      heatDirty = true;
      trailCtx.clearRect(0, 0, W, H);
      if (reduced) staticRender();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- go ----
    resize();
    setCount(count);
    setSpeed(parseInt(sSlider.value, 10));
    updateBetaReadout();
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
