/* ============================================================
   Blog widget: Annealed Importance Sampling (AIS) & Sequential
   Monte Carlo (SMC).

   A POPULATION of weighted particles is carried through the
   annealing sequence  β_0 = 0 < β_1 < ... < β_K = 1, where
       p_{β}(x) ∝ p̃(x)^{β}
   (β = 0 is the flat reference, β = 1 is the target). Each level:
     1. MOVE every particle with a MALA kernel targeting the
        current bridge p_{β_k} (score is scaled by β_k);
     2. REWEIGHT: multiply each weight by the incremental ratio
          p_{β_{k+1}}(x) / p_{β_k}(x) = exp((β_{k+1}−β_k)·log p̃(x)).
   Track normalized weights and the effective sample size
          ESS = (Σ w)² / Σ w².
   When ESS < ½·N, RESAMPLE (draw particles ∝ weight, reset the
   weights to uniform) — the SMC step. The anneal loops: at β = 1
   we restart from β = 0 with fresh uniform weights.

   Particles are drawn with radius/opacity ∝ normalized weight, so
   weight concentration is visible. With resampling OFF the weights
   degenerate onto a few particles (ESS → small); with resampling
   ON the population stays healthy and covers all three modes with
   the CORRECT (unbiased) weights.

   Controls: intermediate steps K, particle count, and a
   resampling on/off switch. Editable mixture (drag / click-add /
   double-click-delete).

   Mount points: any element with data-widget="smc".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'smc';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;
  const MAX_PARTICLES = 600;
  const MAX_MODES = 8;
  const K_MIN = 6, K_MAX = 80;          // number of intermediate annealing steps
  const SWEEPS = 2;                      // MALA sweeps per temperature level
  const H_FRAC = 0.05;                  // step size as a fraction of sigma²
  const FRAMES_PER_LEVEL = 6;           // animation frames spent on each β level
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

    // row 1: resampling switch + β / ESS readout
    const row1 = document.createElement('div');
    row1.className = 'ld-row';
    const seg = document.createElement('div');
    seg.className = 'ld-seg';
    const btnOff = document.createElement('button');
    btnOff.type = 'button'; btnOff.dataset.mode = 'off'; btnOff.textContent = 'resampling: off';
    const btnOn = document.createElement('button');
    btnOn.type = 'button'; btnOn.dataset.mode = 'on'; btnOn.textContent = 'resampling: on';
    seg.append(btnOff, btnOn);
    const acc = document.createElement('span');
    acc.className = 'ld-acc mono';
    row1.append(seg, acc);

    // row 2: β progress + ESS bar (built from inline-styled spans; no new CSS)
    const row2 = document.createElement('div');
    row2.className = 'ld-row';
    const barLabel = document.createElement('label');
    barLabel.className = 'mono ld-label';
    barLabel.innerHTML = 'ESS';
    const barWrap = document.createElement('div');
    barWrap.style.cssText =
      'flex:1;height:8px;border-radius:999px;overflow:hidden;' +
      'background:var(--surface-2);border:1px solid var(--border);';
    const bar = document.createElement('div');
    bar.style.cssText =
      'height:100%;width:0%;border-radius:999px;background:var(--accent);' +
      'transition:width 0.18s ease, background-color 0.18s ease;';
    barWrap.append(bar);
    row2.append(barLabel, barWrap);

    // row 3: number of intermediate steps K
    const row3 = document.createElement('div');
    row3.className = 'ld-row';
    const kLabel = document.createElement('label');
    kLabel.className = 'mono ld-label';
    const kSlider = document.createElement('input');
    kSlider.type = 'range'; kSlider.min = '0'; kSlider.max = '100';
    kSlider.value = '40'; kSlider.className = 'ld-slider';
    kSlider.setAttribute('aria-label', 'number of intermediate steps');
    row3.append(kLabel, kSlider);

    // row 4: particle count
    const row4 = document.createElement('div');
    row4.className = 'ld-row';
    const pLabel = document.createElement('label');
    pLabel.className = 'mono ld-label';
    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = '20'; pSlider.max = String(MAX_PARTICLES);
    pSlider.value = '260'; pSlider.className = 'ld-slider';
    pSlider.setAttribute('aria-label', 'number of particles');
    row4.append(pLabel, pSlider);

    controls.append(row1, row2, row3, row4);

    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'A population is carried from the flat reference (<b>β = 0</b>) to the target ' +
      '(<b>β = 1</b>): each level the particles take a Langevin step and their ' +
      '<b>weights</b> are multiplied by the incremental density ratio (dot size ∝ ' +
      'weight). With <b>resampling off</b> the weight piles onto a handful of ' +
      'particles and the <b>ESS</b> collapses; with <b>resampling on</b>, whenever ' +
      'ESS drops below half the population we resample (flash) and recover a healthy, ' +
      'mode-covering cloud — with the correct, unbiased weights. The anneal loops. ' +
      'Editable mixture — drag a mode, click to add, double-click to remove.';

    host.append(canvas, controls, caption);

    // ---- state ----
    const ctx = canvas.getContext('2d');
    const flash = document.createElement('canvas');     // resample-event flash layer
    const flashCtx = flash.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let particles = [];                  // { x, y, logw }
    let count = parseInt(pSlider.value, 10);
    let K = kFromSlider(parseInt(kSlider.value, 10));
    let resample = true;
    let running = true;
    let heatDirty = true;

    let level = 0;                       // current annealing level (0..K)
    let beta = 0;                        // current β
    let subFrame = 0;                    // animation sub-frame within a level
    let ess = count;                     // current effective sample size
    let flashTimer = 0;                  // countdown for the resample flash glow

    const logs = new Float64Array(MAX_MODES);
    const g = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }
    function kFromSlider(t) { return Math.round(K_MIN * Math.pow(K_MAX / K_MIN, t / 100)); }

    function initModes() {
      const base = sigma();
      modes = MODES_N.map((d) => ({ x: d.x * W, y: d.y * H, w: d.w, rel: d.s, s: base * d.s }));
    }

    // log p̃(x) (unnormalized target) via log-sum-exp; writes ∇log p̃ into `out`.
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
      if (out) { out.x = gx; out.y = gy; }
      return maxLog + Math.log(Z);       // logp (unnormalized)
    }

    function inBounds(x, y) { return x >= 2 && x <= W - 2 && y >= 2 && y <= H - 2; }

    function resetAnneal() {
      // β = 0 is the flat reference: scatter uniformly, fresh uniform weights.
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x = 2 + Math.random() * (W - 4);
        p.y = 2 + Math.random() * (H - 4);
        p.logw = 0;
      }
      level = 0; beta = 0; subFrame = 0; ess = count;
    }

    function setCount(n) {
      count = n;
      while (particles.length < n) particles.push({ x: Math.random() * W, y: Math.random() * H, logw: 0 });
      if (particles.length > n) particles.length = n;
      pLabel.innerHTML = 'particles: <b>' + n + '</b>';
      resetAnneal();
    }
    function setK(t) {
      K = kFromSlider(t);
      kLabel.innerHTML = 'steps K: <b>' + K + '</b>';
      resetAnneal();
    }
    function setResample(on) {
      resample = on;
      btnOn.classList.toggle('active', on);
      btnOff.classList.toggle('active', !on);
      flashCtx.clearRect(0, 0, W, H);
      resetAnneal();
    }

    // normalized weights -> Float64Array (length count), and ESS as a side-effect.
    function normWeights() {
      let maxLog = -Infinity;
      for (let i = 0; i < count; i++) if (particles[i].logw > maxLog) maxLog = particles[i].logw;
      let sum = 0, sum2 = 0;
      const w = new Float64Array(count);
      for (let i = 0; i < count; i++) { const e = Math.exp(particles[i].logw - maxLog); w[i] = e; sum += e; }
      for (let i = 0; i < count; i++) { w[i] /= sum; sum2 += w[i] * w[i]; }
      ess = sum2 > 0 ? 1 / sum2 : count;
      return w;
    }

    // one MALA sweep targeting the current bridge p_β ∝ p̃^β  (score scaled by β).
    function malaSweep(b) {
      const sig = sigma();
      const h = H_FRAC * sig * sig;
      const sqrt2h = Math.sqrt(2 * h);
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const lpx = score(p.x, p.y, g);
        const mux = p.x + h * b * g.x, muy = p.y + h * b * g.y;
        const yx = mux + sqrt2h * randn(), yy = muy + sqrt2h * randn();
        if (!inBounds(yx, yy)) continue;                 // reject moves off-canvas
        const lpy = score(yx, yy, g);
        const muyx = yx + h * b * g.x, muyy = yy + h * b * g.y;
        const logqyx = -(((yx - mux) ** 2) + ((yy - muy) ** 2)) / (4 * h);
        const logqxy = -(((p.x - muyx) ** 2) + ((p.y - muyy) ** 2)) / (4 * h);
        const logAlpha = b * (lpy - lpx) + (logqxy - logqyx);
        if (Math.log(Math.random()) < logAlpha) { p.x = yx; p.y = yy; }
      }
    }

    // resample ∝ weight via the low-variance (systematic) scheme, then reset weights.
    function doResample(w) {
      const positions = new Float64Array(count);
      const start = Math.random() / count;
      for (let i = 0; i < count; i++) positions[i] = start + i / count;
      const out = new Array(count);
      let cum = w[0], j = 0;
      for (let i = 0; i < count; i++) {
        while (positions[i] > cum && j < count - 1) { j++; cum += w[j]; }
        const src = particles[j];
        out[i] = { x: src.x, y: src.y, logw: 0 };
      }
      particles = out;
      // flash the layer to mark the SMC event
      flashCtx.fillStyle = 'rgba(248,113,113,0.5)';
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        flashCtx.beginPath(); flashCtx.arc(p.x, p.y, 3.2, 0, TWO_PI); flashCtx.fill();
      }
      flashTimer = 14;
    }

    // advance the anneal by one β level (move, reweight, maybe resample).
    function advanceLevel() {
      if (level >= K) { resetAnneal(); return; }
      const b1 = (level + 1) / K;
      // (1) move particles with the bridge kernel at the level we are leaving
      for (let s = 0; s < SWEEPS; s++) malaSweep(beta);
      // (2) reweight by the incremental ratio exp((β_{k+1}−β_k)·log p̃)
      const dBeta = b1 - beta;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.logw += dBeta * score(p.x, p.y, null);
      }
      beta = b1; level++;
      // (3) compute ESS; resample if it has collapsed past half the population
      const w = normWeights();
      if (resample && ess < 0.5 * count && level < K) doResample(w);
    }

    function updateReadout() {
      const pct = Math.max(0, Math.min(1, ess / count));
      bar.style.width = (pct * 100).toFixed(1) + '%';
      // colour the bar by health: red when degenerate, accent when healthy
      bar.style.background = pct < 0.25 ? 'rgba(248,113,113,0.95)' : 'var(--accent)';
      acc.innerHTML =
        'β: <b>' + beta.toFixed(2) + '</b> &nbsp; ESS: <b>' +
        Math.round(ess) + '</b>/' + count;
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
      ctx.clearRect(0, 0, W, H);
      if (heatDirty) renderHeat();
      ctx.drawImage(heat, 0, 0, W, H);

      // particles drawn with radius/opacity ∝ normalized weight, so weight
      // concentration (the whole point) is visible at a glance.
      const w = normWeights();
      let wMax = 1e-12;
      for (let i = 0; i < count; i++) if (w[i] > wMax) wMax = w[i];
      const accent = cssVar('--accent') || '#6ee7ff';
      const rgb = accentRGB(accent);
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const rel = w[i] / wMax;                 // 0..1 relative weight
        const rad = 1.1 + 3.6 * Math.sqrt(rel);  // sqrt so area ~ weight
        const alpha = 0.22 + 0.74 * Math.pow(rel, 0.5);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')';
        ctx.arc(p.x, p.y, rad, 0, TWO_PI);
        ctx.fill();
      }

      // resample flash overlay, fading out
      if (flashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, flashTimer / 14);
        ctx.drawImage(flash, 0, 0, W, H);
        ctx.restore();
      }

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

    function accentRGB(c) {
      c = c.trim();
      if (c[0] === '#') {
        let h = c.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
      }
      const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
      return m ? m[1] + ',' + m[2] + ',' + m[3] : '110,231,255';
    }

    let tick = 0;
    function frame() {
      if (running && !reduced) {
        if (flashTimer > 0) flashTimer--;
        // pace the anneal: one β level every FRAMES_PER_LEVEL frames
        if ((subFrame++ % FRAMES_PER_LEVEL) === 0) advanceLevel();
        else for (let s = 0; s < 1; s++) malaSweep(beta);   // keep cloud lively between levels
        draw();
        if ((++tick % 3) === 0) updateReadout();
      }
      requestAnimationFrame(frame);
    }

    function resize() {
      const w = Math.max(280, Math.round(host.clientWidth));
      const h = Math.round(w * 0.6);
      const oldW = W, oldH = H;
      W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, flash]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      // run a full anneal to β = 1 so the static frame shows the converged cloud
      resetAnneal();
      let guard = 0;
      while (level < K && guard++ < 4000) advanceLevel();
      updateReadout();
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
    btnOff.addEventListener('click', () => setResample(false));
    btnOn.addEventListener('click', () => setResample(true));
    kSlider.addEventListener('input', () => setK(parseInt(kSlider.value, 10)));
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
      flashCtx.clearRect(0, 0, W, H);
      if (reduced) staticRender();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- go ----
    resize();
    setCount(count);
    setK(parseInt(kSlider.value, 10));
    setResample(true);
    updateReadout();
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
