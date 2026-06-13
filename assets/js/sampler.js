/* ============================================================
   Interactive hero: particles running (annealed) Langevin
   dynamics on a 2D Gaussian mixture.

   x_{k+1} = x_k + h * ∇log p(x_k) + sqrt(2 h T) * ξ

   Visitors can click to add modes, drag them around and
   double-click to remove them. Step sizes / noise scales are
   tuned for looks, not for integrator accuracy — this is a
   visualization, not a benchmark. (See "Beyond ELBOs" for the
   benchmark.)
   ============================================================ */

(function () {
  'use strict';

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- state ----------

  const N_PARTICLES = 340;
  const MAX_MODES = 8;

  let W = 0, H = 0, dpr = 1;
  let modes = [];          // {x, y, sigma} in CSS pixels
  let particles = [];      // {x, y}
  let temperature = 1.0;   // user-set
  let annealing = false;
  let annealPhase = 0;
  let running = true;
  let heatmapDirty = true;
  let totalSteps = 0;      // particle steps, for the footer counter

  // trail layer (particles + fading) and heatmap layer
  const trail = document.createElement('canvas');
  const trailCtx = trail.getContext('2d');
  const heat = document.createElement('canvas');
  const heatCtx = heat.getContext('2d');
  const HEAT_RES = 170; // heatmap width in cells

  // ---------- helpers ----------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function theme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      dark,
      // fade color must match page background for trails to dissolve cleanly
      fade: dark ? 'rgba(11, 14, 26, 0.16)' : 'rgba(247, 248, 253, 0.16)',
      heatR: parseInt(cssVar('--heat-r')) || 110,
      heatG: parseInt(cssVar('--heat-g')) || 231,
      heatB: parseInt(cssVar('--heat-b')) || 255,
      particleA: dark ? 'rgba(110, 231, 255, 0.85)' : 'rgba(79, 70, 229, 0.75)',
      particleB: dark ? 'rgba(167, 139, 250, 0.85)' : 'rgba(14, 165, 233, 0.75)',
      modeRing: dark ? 'rgba(232, 235, 245, 0.25)' : 'rgba(24, 28, 46, 0.2)',
    };
  }

  function randn() {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function baseSigma() { return Math.min(W, H) * 0.062; }

  // ---------- setup ----------

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const oldW = W, oldH = H;
    W = rect.width;
    H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const c of [canvas, trail]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    heat.width = HEAT_RES;
    heat.height = Math.max(2, Math.round(HEAT_RES * H / Math.max(W, 1)));

    // keep modes/particles in proportional positions on resize
    if (oldW > 0 && oldH > 0) {
      const sx = W / oldW, sy = H / oldH;
      for (const m of modes) { m.x *= sx; m.y *= sy; m.sigma = baseSigma() * m.rel; }
      for (const p of particles) { p.x *= sx; p.y *= sy; }
    }
    heatmapDirty = true;
  }

  function initModes() {
    modes = [];
    // a pleasing default: 4 modes loosely ringed around the hero text
    const cx = W / 2, cy = H / 2;
    const rx = W * 0.33, ry = H * 0.30;
    const angles = [-2.5, -0.6, 0.7, 2.3];
    for (const a of angles) {
      const rel = 0.85 + Math.random() * 0.5;
      modes.push({
        x: cx + Math.cos(a) * rx * (0.85 + Math.random() * 0.25),
        y: cy + Math.sin(a) * ry * (0.85 + Math.random() * 0.25),
        rel,
        sigma: baseSigma() * rel,
      });
    }
  }

  function scatterParticles() {
    particles = [];
    for (let i = 0; i < N_PARTICLES; i++) {
      particles.push({ x: Math.random() * W, y: Math.random() * H });
    }
    trailCtx.clearRect(0, 0, W, H);
  }

  // ---------- math ----------

  // ∇log p(x) for an equal-weight GMM, via responsibilities.
  function score(x, y, out) {
    let maxLog = -Infinity;
    const logs = scoreLogs;
    for (let i = 0; i < modes.length; i++) {
      const m = modes[i];
      const dx = x - m.x, dy = y - m.y;
      const s2 = m.sigma * m.sigma;
      logs[i] = -(dx * dx + dy * dy) / (2 * s2) - Math.log(s2);
      if (logs[i] > maxLog) maxLog = logs[i];
    }
    let Z = 0;
    for (let i = 0; i < modes.length; i++) {
      logs[i] = Math.exp(logs[i] - maxLog);
      Z += logs[i];
    }
    let gx = 0, gy = 0;
    for (let i = 0; i < modes.length; i++) {
      const m = modes[i];
      const r = logs[i] / Z;
      const s2 = m.sigma * m.sigma;
      gx += r * (m.x - x) / s2;
      gy += r * (m.y - y) / s2;
    }
    out.x = gx;
    out.y = gy;
  }
  const scoreLogs = new Float64Array(MAX_MODES);
  const g = { x: 0, y: 0 };

  function currentTemp() {
    if (!annealing) return temperature;
    // slow cosine schedule: T sweeps 2.8 → 0.05 → 2.8 …
    const t = 0.5 * (1 + Math.cos(annealPhase));
    return 0.05 + t * 2.75;
  }

  function stepParticles() {
    const T = currentTemp();
    const sig = baseSigma();
    const h = sig * sig * 0.045;          // step size, scaled to the scene
    const noise = Math.sqrt(2 * h * T) * 0.55; // damped for smoother visuals

    for (const p of particles) {
      score(p.x, p.y, g);
      p.x += h * g.x + noise * randn();
      p.y += h * g.y + noise * randn();
      // soft walls so strays come back
      if (p.x < -40) p.x = -40; else if (p.x > W + 40) p.x = W + 40;
      if (p.y < -40) p.y = -40; else if (p.y > H + 40) p.y = H + 40;
    }
    totalSteps += particles.length;
    if (annealing) annealPhase += 0.012;
  }

  // ---------- rendering ----------

  function renderHeatmap() {
    const t = theme();
    const hw = heat.width, hh = heat.height;
    const img = heatCtx.createImageData(hw, hh);
    const data = img.data;
    const sx = W / hw, sy = H / hh;

    // unnormalized density, then normalize by max for display
    const vals = new Float64Array(hw * hh);
    let maxV = 1e-12;
    for (let j = 0; j < hh; j++) {
      const y = (j + 0.5) * sy;
      for (let i = 0; i < hw; i++) {
        const x = (i + 0.5) * sx;
        let v = 0;
        for (const m of modes) {
          const dx = x - m.x, dy = y - m.y;
          const s2 = m.sigma * m.sigma;
          v += Math.exp(-(dx * dx + dy * dy) / (2 * s2)) / s2;
        }
        vals[j * hw + i] = v;
        if (v > maxV) maxV = v;
      }
    }
    const alphaMax = t.dark ? 70 : 48;
    for (let k = 0; k < vals.length; k++) {
      const v = Math.pow(vals[k] / maxV, 0.6); // gamma for visible tails
      const o = k * 4;
      data[o] = t.heatR;
      data[o + 1] = t.heatG;
      data[o + 2] = t.heatB;
      data[o + 3] = Math.round(v * alphaMax);
    }
    heatCtx.putImageData(img, 0, 0);
    heatmapDirty = false;
  }

  function draw() {
    const t = theme();

    // fade old trails toward the background color
    trailCtx.fillStyle = t.fade;
    trailCtx.fillRect(0, 0, W, H);

    trailCtx.globalCompositeOperation = t.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      trailCtx.fillStyle = i % 2 ? t.particleA : t.particleB;
      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, 1.6, 0, 6.2832);
      trailCtx.fill();
    }
    trailCtx.globalCompositeOperation = 'source-over';

    // compose: heatmap underneath, trails on top, mode rings last
    ctx.clearRect(0, 0, W, H);
    if (heatmapDirty) renderHeatmap();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heat, 0, 0, W, H);
    ctx.drawImage(trail, 0, 0, W, H);

    for (const m of modes) {
      ctx.strokeStyle = t.modeRing;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.sigma, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function frame() {
    if (running && !reducedMotion) {
      stepParticles();
      draw();
    }
    requestAnimationFrame(frame);
  }

  // ---------- interaction ----------

  let dragMode = null;
  let downPos = null;
  let downTime = 0;
  let moved = false;

  function hitMode(x, y) {
    for (const m of modes) {
      const dx = x - m.x, dy = y - m.y;
      if (dx * dx + dy * dy < m.sigma * m.sigma * 0.9) return m;
    }
    return null;
  }

  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = localPos(e);
    downPos = p;
    downTime = performance.now();
    moved = false;
    dragMode = hitMode(p.x, p.y);
    if (dragMode) {
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = localPos(e);
    if (downPos && (Math.abs(p.x - downPos.x) > 5 || Math.abs(p.y - downPos.y) > 5)) {
      moved = true;
    }
    if (dragMode) {
      dragMode.x = p.x;
      dragMode.y = p.y;
      heatmapDirty = true;
      e.preventDefault();
    } else {
      canvas.style.cursor = hitMode(p.x, p.y) ? 'grab' : 'crosshair';
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    const p = localPos(e);
    const quickTap = performance.now() - downTime < 350 && !moved;
    if (!dragMode && quickTap && modes.length < MAX_MODES) {
      const rel = 0.8 + Math.random() * 0.5;
      modes.push({ x: p.x, y: p.y, rel, sigma: baseSigma() * rel });
      heatmapDirty = true;
    }
    dragMode = null;
    downPos = null;
    canvas.style.cursor = 'crosshair';
  });

  canvas.addEventListener('dblclick', (e) => {
    if (modes.length <= 1) return;
    const p = localPos(e);
    const m = hitMode(p.x, p.y);
    if (m) {
      modes.splice(modes.indexOf(m), 1);
      heatmapDirty = true;
    }
  });

  // ---------- controls ----------

  const tempSlider = document.getElementById('temp-slider');
  const tempReadout = document.getElementById('temp-readout');
  const annealBtn = document.getElementById('anneal-btn');
  const noiseBtn = document.getElementById('noise-btn');

  if (tempSlider) {
    tempSlider.addEventListener('input', () => {
      temperature = parseFloat(tempSlider.value);
      if (annealing) toggleAnneal(false);
      tempReadout.textContent = temperature.toFixed(2);
    });
  }

  function toggleAnneal(on) {
    annealing = on;
    annealPhase = Math.PI; // start hot
    if (annealBtn) {
      annealBtn.textContent = 'anneal: ' + (on ? 'on' : 'off');
      annealBtn.classList.toggle('on', on);
    }
  }

  if (annealBtn) annealBtn.addEventListener('click', () => toggleAnneal(!annealing));
  if (noiseBtn) noiseBtn.addEventListener('click', scatterParticles);

  // live temperature readout while annealing
  setInterval(() => {
    if (annealing && tempReadout) tempReadout.textContent = currentTemp().toFixed(2);
  }, 150);

  // ---------- lifecycle ----------

  // pause when the hero is off screen or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      running = entries[0].isIntersecting;
    }, { threshold: 0.02 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!('IntersectionObserver' in window)) running = true;
  });

  // re-render heatmap + clear trails when the theme flips
  new MutationObserver(() => {
    heatmapDirty = true;
    trailCtx.clearRect(0, 0, W, H);
    if (reducedMotion) staticRender();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (reducedMotion) staticRender();
    }, 120);
  });

  function staticRender() {
    // settle the chain without animating, then draw once
    for (let i = 0; i < 220; i++) stepParticles();
    trailCtx.clearRect(0, 0, W, H);
    draw();
  }

  // expose the step counter for the footer
  window.__samplerSteps = () => totalSteps;

  // ---------- go ----------

  resize();
  initModes();
  scatterParticles();
  if (reducedMotion) {
    staticRender();
  } else {
    requestAnimationFrame(frame);
  }
})();
