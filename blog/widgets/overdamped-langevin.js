/* ============================================================
   Blog widget: overdamped Langevin dynamics on a Gaussian mixture.

   Particles follow the unadjusted Langevin update (T = 1)
       x_{k+1} = x_k + h ∇log p(x_k) + sqrt(2h) ξ ,   ξ ~ N(0, I)
   over a fixed weighted Gaussian-mixture target whose density is
   drawn as a heatmap behind them. The ONLY control is a slider for
   how many particle trajectories are shown — deliberately no
   annealing, no re-noising and no momentum (those come later in
   the series).

   Mount points: any element with data-widget="overdamped-langevin".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'overdamped-langevin';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;            // heatmap resolution (cells across)
  const MAX_PARTICLES = 500;
  const MAX_MODES = 8;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fixed target: three well-separated modes (so slow mode-hopping is visible).
  // Coordinates are normalized to the canvas; w = weight, s = relative width.
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
    controls.className = 'ld-controls';
    const label = document.createElement('label');
    label.className = 'mono ld-label';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(MAX_PARTICLES);
    slider.value = '120';
    slider.className = 'ld-slider';
    slider.setAttribute('aria-label', 'number of particles');
    controls.append(label, slider);
    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'Shading is the target density (a Gaussian mixture); each dot is a Langevin ' +
      'particle. <b>Drag</b> a mode to move it, <b>click</b> empty space to add one, ' +
      '<b>double-click</b> a mode to remove it. Drop the slider to <b>1</b> to follow ' +
      'a single trajectory and watch how rarely it crosses between modes.';
    host.append(canvas, controls, caption);

    const ctx = canvas.getContext('2d');
    const trail = document.createElement('canvas');
    const trailCtx = trail.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let particles = [];
    let count = parseInt(slider.value, 10);
    let running = true;
    let heatDirty = true;
    const logs = new Float64Array(MODES_N.length);
    const g = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }

    // modes carry a relative width `rel` so sigma rescales with the canvas;
    // built once, then preserved (and rescaled) across resizes / user edits.
    function initModes() {
      const base = sigma();
      modes = MODES_N.map((d) => ({ x: d.x * W, y: d.y * H, w: d.w, rel: d.s, s: base * d.s }));
    }

    function setCount(n) {
      count = n;
      while (particles.length < n) particles.push({ x: Math.random() * W, y: Math.random() * H });
      if (particles.length > n) particles.length = n;
      label.innerHTML = 'particles: <b>' + n + '</b>';
    }

    // ∇log p(x) for the weighted Gaussian mixture (responsibilities via log-sum-exp).
    function score(x, y, out) {
      let maxLog = -Infinity;
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i];
        const dx = x - m.x, dy = y - m.y, s2 = m.s * m.s;
        logs[i] = Math.log(m.w) - Math.log(TWO_PI * s2) - (dx * dx + dy * dy) / (2 * s2);
        if (logs[i] > maxLog) maxLog = logs[i];
      }
      let Z = 0;
      for (let i = 0; i < modes.length; i++) { logs[i] = Math.exp(logs[i] - maxLog); Z += logs[i]; }
      let gx = 0, gy = 0;
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i], r = logs[i] / Z, s2 = m.s * m.s;
        gx += r * (m.x - x) / s2;
        gy += r * (m.y - y) / s2;
      }
      out.x = gx; out.y = gy;
    }

    function step() {
      const sig = sigma();
      const h = sig * sig * 0.012;       // step size
      const noise = Math.sqrt(2 * h);    // T = 1, so √(2hT) = √(2h)
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        score(p.x, p.y, g);
        p.x += h * g.x + noise * randn();
        p.y += h * g.y + noise * randn();
        if (p.x < 2) p.x = 2; else if (p.x > W - 2) p.x = W - 2;
        if (p.y < 2) p.y = 2; else if (p.y > H - 2) p.y = H - 2;
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
        data[o] = r; data[o + 1] = gg; data[o + 2] = b;
        data[o + 3] = Math.round(v * alphaMax);
      }
      heatCtx.putImageData(img, 0, 0);
      heatDirty = false;
    }

    function draw() {
      // fade existing trails toward transparent so the heatmap stays visible
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

      // dashed rings mark each mode and act as drag handles
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
    function redrawIfStatic() { if (reduced) draw(); } // animated mode redraws itself

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
    canvas.addEventListener('pointerup', (e) => {
      const p = localPos(e);
      const quickTap = performance.now() - downTime < 350 && !moved;
      if (!dragMode && quickTap && modes.length < MAX_MODES) {
        const base = sigma(), rel = 0.8 + Math.random() * 0.5;
        modes.push({ x: p.x, y: p.y, w: 1, rel, s: base * rel });
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
    slider.addEventListener('input', () => setCount(parseInt(slider.value, 10)));

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

    resize();
    setCount(count);
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
