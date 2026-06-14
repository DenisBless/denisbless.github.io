/* ============================================================
   Blog widget: underdamped (second-order) Langevin dynamics.

   Augment position x with a velocity v and integrate
       dx = v dt
       dv = ∇log p(x) dt − γ v dt + sqrt(2γ) dW
   whose stationary law is p(x) ⊗ N(v; 0, I): the position marginal
   is still the target p, for ANY friction γ. We use the BAOAB
   splitting (Leimkuhler–Matthews) — the O (Ornstein–Uhlenbeck)
   half uses the exact OU update, so the integrator stays stable at
   every friction the slider can reach.

   Controls: a friction slider γ (low γ = ballistic/momentum-driven,
   high γ = the overdamped diffusion of Part I) and a particle
   slider. The mixture is editable: drag / click-add / dbl-click.

   Mount points: any element with data-widget="underdamped-langevin".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'underdamped-langevin';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;
  const MAX_PARTICLES = 400;
  const MAX_MODES = 8;
  const G_MIN = 0.02, G_MAX = 4.0;     // friction range (log slider)
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

    const canvas = document.createElement('canvas');
    canvas.className = 'ld-canvas';

    const controls = document.createElement('div');
    controls.className = 'ld-controls-col';

    const row1 = document.createElement('div');
    row1.className = 'ld-row';
    const gLabel = document.createElement('label');
    gLabel.className = 'mono ld-label';
    const gSlider = document.createElement('input');
    gSlider.type = 'range'; gSlider.min = '0'; gSlider.max = '100';
    gSlider.value = '40'; gSlider.className = 'ld-slider';
    gSlider.setAttribute('aria-label', 'friction');
    row1.append(gLabel, gSlider);

    const row2 = document.createElement('div');
    row2.className = 'ld-row';
    const pLabel = document.createElement('label');
    pLabel.className = 'mono ld-label';
    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = '1'; pSlider.max = String(MAX_PARTICLES);
    pSlider.value = '100'; pSlider.className = 'ld-slider';
    pSlider.setAttribute('aria-label', 'number of particles');
    row2.append(pLabel, pSlider);

    controls.append(row1, row2);

    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'Each particle now carries momentum. <b>Low friction γ</b> → smooth, ballistic ' +
      'sweeps that travel in near-straight lines (momentum barely dissipates); ' +
      '<b>high friction γ</b> → the jittery, diffusive overdamped walk of Part I. ' +
      'Momentum trades the random walk for directed motion — but the target it samples ' +
      'is identical. Editable mixture — drag a mode, click to add, double-click to remove.';

    host.append(canvas, controls, caption);

    const ctx = canvas.getContext('2d');
    const trail = document.createElement('canvas');
    const trailCtx = trail.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let particles = [];
    let count = parseInt(pSlider.value, 10);
    let friction = gFromSlider(parseInt(gSlider.value, 10));
    let running = true;
    let heatDirty = true;
    const logs = new Float64Array(MAX_MODES);
    const g = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }
    function gFromSlider(t) { return G_MIN * Math.pow(G_MAX / G_MIN, t / 100); }

    function initModes() {
      const base = sigma();
      modes = MODES_N.map((d) => ({ x: d.x * W, y: d.y * H, w: d.w, rel: d.s, s: base * d.s }));
    }
    function setCount(n) {
      count = n;
      while (particles.length < n) particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0 });
      if (particles.length > n) particles.length = n;
      pLabel.innerHTML = 'particles: <b>' + n + '</b>';
    }
    function setFriction(t) {
      friction = gFromSlider(t);
      gLabel.innerHTML = 'friction γ: <b>' + friction.toFixed(2) + '</b>';
    }

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

    // BAOAB step. FORCE = VSCALE^2 makes the position marginal exactly p
    // (velocity "temperature" and the score's potential are matched).
    function step() {
      const sig = sigma();
      const VSCALE = sig * 0.18, FORCE = VSCALE * VSCALE;
      const c = Math.exp(-friction), sN = Math.sqrt(1 - c * c) * VSCALE;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        score(p.x, p.y, g);                       // B (half kick)
        p.vx += 0.5 * FORCE * g.x; p.vy += 0.5 * FORCE * g.y;
        p.x += 0.5 * p.vx; p.y += 0.5 * p.vy;     // A (half drift)
        p.vx = c * p.vx + sN * randn();           // O (exact OU thermostat)
        p.vy = c * p.vy + sN * randn();
        p.x += 0.5 * p.vx; p.y += 0.5 * p.vy;     // A (half drift)
        if (p.x < 2) { p.x = 2; p.vx = Math.abs(p.vx); } else if (p.x > W - 2) { p.x = W - 2; p.vx = -Math.abs(p.vx); }
        if (p.y < 2) { p.y = 2; p.vy = Math.abs(p.vy); } else if (p.y > H - 2) { p.y = H - 2; p.vy = -Math.abs(p.vy); }
        score(p.x, p.y, g);                       // B (half kick)
        p.vx += 0.5 * FORCE * g.x; p.vy += 0.5 * FORCE * g.y;
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

    function frame() {
      if (running && !reduced) { step(); draw(); }
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
    gSlider.addEventListener('input', () => setFriction(parseInt(gSlider.value, 10)));
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
    setFriction(parseInt(gSlider.value, 10));
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
