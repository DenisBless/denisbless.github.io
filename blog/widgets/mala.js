/* ============================================================
   Blog widget: ULA vs. MALA on a Gaussian mixture.

   The same proposal — one Langevin step
       y = x + h ∇log p(x) + sqrt(2h) ξ
   is used in two modes:
     • ULA  — always keep y (biased; unstable at large h)
     • MALA — Metropolis accept/reject with
         log α = log p(y) − log p(x) + log q(x|y) − log q(y|x)
       where q(·|x) = N(x + h∇log p(x), 2h I). Rejected proposals
       flash red and the particle stays put.

   Controls: a ULA/MALA segmented switch, a step-size slider h
   (works in both modes) and a particle-count slider. The mixture
   is editable: drag a mode, click to add, double-click to remove.

   Mount points: any element with data-widget="mala".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'mala';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;
  const MAX_PARTICLES = 500;
  const MAX_MODES = 8;
  // step size h = sigma^2 * c, so c is the dimensionless h/sigma^2. Interesting
  // behaviour (rejections, ULA instability) lives near c ~ 1-2, so span [0.03, 3].
  const C_MIN = 0.03, C_MAX = 3.0;
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

    // row 1: ULA/MALA switch + acceptance readout
    const row1 = document.createElement('div');
    row1.className = 'ld-row';
    const seg = document.createElement('div');
    seg.className = 'ld-seg';
    const btnUla = document.createElement('button');
    btnUla.type = 'button'; btnUla.dataset.mode = 'ula'; btnUla.textContent = 'ULA';
    const btnMala = document.createElement('button');
    btnMala.type = 'button'; btnMala.dataset.mode = 'mala'; btnMala.textContent = 'MALA';
    seg.append(btnUla, btnMala);
    const acc = document.createElement('span');
    acc.className = 'ld-acc mono';
    row1.append(seg, acc);

    // row 2: step size
    const row2 = document.createElement('div');
    row2.className = 'ld-row';
    const stepLabel = document.createElement('label');
    stepLabel.className = 'mono ld-label';
    const stepSlider = document.createElement('input');
    stepSlider.type = 'range'; stepSlider.min = '0'; stepSlider.max = '100';
    stepSlider.value = '50'; stepSlider.className = 'ld-slider';
    stepSlider.setAttribute('aria-label', 'step size');
    row2.append(stepLabel, stepSlider);

    // row 3: particle count
    const row3 = document.createElement('div');
    row3.className = 'ld-row';
    const pLabel = document.createElement('label');
    pLabel.className = 'mono ld-label';
    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = '1'; pSlider.max = String(MAX_PARTICLES);
    pSlider.value = '120'; pSlider.className = 'ld-slider';
    pSlider.setAttribute('aria-label', 'number of particles');
    row3.append(pLabel, pSlider);

    controls.append(row1, row2, row3);

    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'Switch between <b>ULA</b> and <b>MALA</b> and push the <b>step size</b> up: ULA ' +
      'over-disperses and spills past the target, while MALA instead <b>rejects</b> the ' +
      'over-eager proposals (red flashes) and its acceptance rate falls. Editable mixture — ' +
      'drag a mode, click to add, double-click to remove.';

    host.append(canvas, controls, caption);

    // ---- state ----
    const ctx = canvas.getContext('2d');
    const trail = document.createElement('canvas');
    const trailCtx = trail.getContext('2d');
    const rej = document.createElement('canvas');       // rejected-proposal flashes
    const rejCtx = rej.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let particles = [];
    let count = parseInt(pSlider.value, 10);
    let mala = false;                  // start in ULA
    let stepC = cFromSlider(parseInt(stepSlider.value, 10));
    let accEMA = -1;                   // running acceptance rate
    let running = true;
    let heatDirty = true;
    const logs = new Float64Array(MAX_MODES);
    const gradX = { x: 0, y: 0 }, gradY = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }
    function cFromSlider(t) { return C_MIN * Math.pow(C_MAX / C_MIN, t / 100); }

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
    function setStep(t) {
      stepC = cFromSlider(t);
      stepLabel.innerHTML = 'step size: <b>' + stepC.toFixed(2) + '</b>';
    }
    function setMode(on) {
      mala = on;
      accEMA = -1;
      btnMala.classList.toggle('active', on);
      btnUla.classList.toggle('active', !on);
      rejCtx.clearRect(0, 0, W, H);
      updateAcc();
    }
    function updateAcc() {
      if (!mala) { acc.innerHTML = 'ULA — every proposal kept'; return; }
      acc.innerHTML = accEMA < 0
        ? 'acceptance: <b>—</b>'
        : 'acceptance: <b>' + Math.round(accEMA * 100) + '%</b>';
    }

    // log p̃(x) (unnormalized) via log-sum-exp, and ∇log p̃ into `out`.
    function evalp(x, y, out) {
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
      return maxLog + Math.log(Z);
    }

    function clampP(p) {
      if (p.x < 2) p.x = 2; else if (p.x > W - 2) p.x = W - 2;
      if (p.y < 2) p.y = 2; else if (p.y > H - 2) p.y = H - 2;
    }

    function step() {
      const sig = sigma();
      const h = sig * sig * stepC;
      const sqrt2h = Math.sqrt(2 * h);

      // fade the rejection layer
      rejCtx.globalCompositeOperation = 'destination-out';
      rejCtx.fillStyle = 'rgba(0,0,0,0.16)';
      rejCtx.fillRect(0, 0, W, H);
      rejCtx.globalCompositeOperation = 'source-over';
      rejCtx.fillStyle = 'rgba(248,113,113,0.92)';

      let nAcc = 0, nTot = 0;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const lpx = evalp(p.x, p.y, gradX);
        const mux = p.x + h * gradX.x, muy = p.y + h * gradX.y;
        const yx = mux + sqrt2h * randn(), yy = muy + sqrt2h * randn();

        if (!mala) {
          p.x = yx; p.y = yy; clampP(p);
          continue;
        }
        const lpy = evalp(yx, yy, gradY);
        const muyx = yx + h * gradY.x, muyy = yy + h * gradY.y;
        const logqyx = -(((yx - mux) ** 2) + ((yy - muy) ** 2)) / (4 * h);
        const logqxy = -(((p.x - muyx) ** 2) + ((p.y - muyy) ** 2)) / (4 * h);
        const logAlpha = (lpy - lpx) + (logqxy - logqyx);
        nTot++;
        if (Math.log(Math.random()) < logAlpha) {
          p.x = yx; p.y = yy; clampP(p); nAcc++;
        } else {
          // rejected: flash the proposal location, particle stays
          const rx = Math.max(2, Math.min(W - 2, yx)), ry = Math.max(2, Math.min(H - 2, yy));
          rejCtx.beginPath();
          rejCtx.arc(rx, ry, 2, 0, TWO_PI);
          rejCtx.fill();
        }
      }
      if (mala && nTot > 0) {
        const rate = nAcc / nTot;
        accEMA = accEMA < 0 ? rate : accEMA * 0.9 + rate * 0.1;
      }
    }

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
      trailCtx.fillStyle = 'rgba(0,0,0,0.075)';
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
      ctx.drawImage(rej, 0, 0, W, H);

      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.strokeStyle = dark ? 'rgba(232,235,245,0.22)' : 'rgba(24,28,46,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      for (const m of modes) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.s, 0, TWO_PI);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    let tick = 0;
    function frame() {
      if (running && !reduced) {
        step(); draw();
        if ((++tick % 12) === 0) updateAcc(); // keep the acceptance readout current
      }
      requestAnimationFrame(frame);
    }

    function resize() {
      const w = Math.max(280, Math.round(host.clientWidth));
      const h = Math.round(w * 0.6);
      const oldW = W, oldH = H;
      W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, trail, rej]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rejCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      for (let i = 0; i < 260; i++) step();
      trailCtx.clearRect(0, 0, W, H);
      draw();
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
    btnUla.addEventListener('click', () => setMode(false));
    btnMala.addEventListener('click', () => setMode(true));
    stepSlider.addEventListener('input', () => setStep(parseInt(stepSlider.value, 10)));
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
      rejCtx.clearRect(0, 0, W, H);
      if (reduced) staticRender();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- go ----
    resize();
    setCount(count);
    setStep(parseInt(stepSlider.value, 10));
    setMode(false);
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
