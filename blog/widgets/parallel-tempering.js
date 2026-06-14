/* ============================================================
   Blog widget: parallel tempering / replica exchange.

   Run M replicas at FIXED inverse temperatures
       β_1 < β_2 < ... < β_M = 1            (hot → cold),
   each a Langevin (ULA) chain against the tempered target
       p_{β_m} ∝ p̃^{β_m},   i.e.  x += h_m β_m ∇log p̃ + sqrt(2 h_m) ξ,
   with a per-replica step h_m = h_base / β_m (hot replicas, on a
   flatter landscape, take bigger steps). Boundaries reflect.

   Periodically a pair of ADJACENT replicas (m, m+1) proposes
   swapping their configurations, accepted with the replica-exchange
   Metropolis rule
       min(1, exp( (β_m − β_{m+1}) (U(x_m) − U(x_{m+1})) )),   U = −log p̃.
   (This is the log-ratio of the product target ∏ p_{β_m} before/after
   the swap; note the argument order U(x_m) − U(x_{m+1}).) Hot replicas
   cross barriers; swaps ladder those crossings down to the cold β=1
   replica, whose particles ARE the samples from p.

   The cold replica is drawn bright over the true-target heatmap; the
   hotter replicas are tinted warm and faint. Accepted swap-ins on the
   cold chain flash. Readout: mean adjacent-swap acceptance.

   Controls: number of replicas M (sets a geometric β ladder from ~0.1
   to 1), swap-attempt frequency, particles per replica. Editable
   mixture (drag / click-add / dbl-click-delete).

   Mount points: any element with data-widget="parallel-tempering".
   ============================================================ */

(function () {
  'use strict';

  const NAME = 'parallel-tempering';
  const TWO_PI = 6.283185307179586;
  const HEAT_W = 140;
  const MAX_MODES = 8;
  const M_MIN = 2, M_MAX = 8;            // number of replicas
  const BETA_MIN = 0.1;                  // hottest inverse temperature
  const HF = 0.09;                       // h_base = HF * sigma^2 (cold step); h_m = h_base / beta_m
  const PPR_MIN = 1, PPR_MAX = 40;       // particles per replica
  const SWAP_MIN = 1, SWAP_MAX = 30;     // swap attempt every N steps (slider, inverted feel)
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
  // proper reflection of v into [lo, hi]
  function reflect(v, lo, hi) {
    const span = hi - lo;
    if (span <= 0) return lo;
    let t = (v - lo) % (2 * span);
    if (t < 0) t += 2 * span;
    if (t > span) t = 2 * span - t;
    return t + lo;
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

    // row 1: swaps on/off + acceptance readout
    const row1 = document.createElement('div');
    row1.className = 'ld-row';
    const seg = document.createElement('div');
    seg.className = 'ld-seg';
    const btnOff = document.createElement('button');
    btnOff.type = 'button'; btnOff.dataset.mode = 'off'; btnOff.textContent = 'swaps off';
    const btnOn = document.createElement('button');
    btnOn.type = 'button'; btnOn.dataset.mode = 'on'; btnOn.textContent = 'swaps on';
    seg.append(btnOff, btnOn);
    const acc = document.createElement('span');
    acc.className = 'ld-acc mono';
    row1.append(seg, acc);

    // row 2: number of replicas M
    const row2 = document.createElement('div');
    row2.className = 'ld-row';
    const mLabel = document.createElement('label');
    mLabel.className = 'mono ld-label';
    const mSlider = document.createElement('input');
    mSlider.type = 'range'; mSlider.min = String(M_MIN); mSlider.max = String(M_MAX);
    mSlider.value = '6'; mSlider.className = 'ld-slider';
    mSlider.setAttribute('aria-label', 'number of replicas');
    row2.append(mLabel, mSlider);

    // row 3: swap frequency
    const row3 = document.createElement('div');
    row3.className = 'ld-row';
    const sLabel = document.createElement('label');
    sLabel.className = 'mono ld-label';
    const sSlider = document.createElement('input');
    sSlider.type = 'range'; sSlider.min = String(SWAP_MIN); sSlider.max = String(SWAP_MAX);
    sSlider.value = '4'; sSlider.className = 'ld-slider';
    sSlider.setAttribute('aria-label', 'swap attempt interval');
    row3.append(sLabel, sSlider);

    // row 4: particles per replica
    const row4 = document.createElement('div');
    row4.className = 'ld-row';
    const pLabel = document.createElement('label');
    pLabel.className = 'mono ld-label';
    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = String(PPR_MIN); pSlider.max = String(PPR_MAX);
    pSlider.value = '10'; pSlider.className = 'ld-slider';
    pSlider.setAttribute('aria-label', 'particles per replica');
    row4.append(pLabel, pSlider);

    controls.append(row1, row2, row3, row4);

    const caption = document.createElement('p');
    caption.className = 'ld-caption mono';
    caption.innerHTML =
      'Bright dots are the <b>cold</b> (β = 1) replica — your real samples; warm faint ' +
      'clouds are the <b>hotter</b> replicas, roaming freely. With <b>swaps off</b> the ' +
      'cold cloud stays trapped in one mode; with <b>swaps on</b>, hot crossings ladder ' +
      'down (swap-ins flash) and the cold chain visits all three modes in the right ' +
      'proportions. More <b>replicas</b> → finer ladder, more accepted swaps. ' +
      'Editable mixture — drag a mode, click to add, double-click to remove.';

    host.append(canvas, controls, caption);

    // ---- state ----
    const ctx = canvas.getContext('2d');
    const hot = document.createElement('canvas');        // hotter replicas (faint, warm)
    const hotCtx = hot.getContext('2d');
    const cold = document.createElement('canvas');       // cold replica (bright)
    const coldCtx = cold.getContext('2d');
    const flash = document.createElement('canvas');      // swap-in flashes on the cold chain
    const flashCtx = flash.getContext('2d');
    const heat = document.createElement('canvas');
    const heatCtx = heat.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let modes = [];
    let M = parseInt(mSlider.value, 10);
    let ppr = parseInt(pSlider.value, 10);          // particles per replica
    let swapEvery = parseInt(sSlider.value, 10);
    let swapsOn = true;
    let betas = [];                                 // length M, hot -> cold (last = 1)
    // replicas[m] = array of {x,y} particles; replicas[M-1] is cold
    let replicas = [];
    let accEMA = -1;
    let running = true;
    let heatDirty = true;
    let tickCount = 0;     // counts simulation steps (drives swap timing)
    let frameNo = 0;       // counts animation frames (drives readout cadence)
    let swapParity = 0;
    const logs = new Float64Array(MAX_MODES);
    const g = { x: 0, y: 0 };

    function sigma() { return Math.min(W, H) * 0.075; }

    function buildBetas() {
      betas = [];
      if (M === 1) { betas = [1]; return; }
      for (let k = 0; k < M; k++) {
        betas.push(BETA_MIN * Math.pow(1 / BETA_MIN, k / (M - 1)));
      }
      betas[M - 1] = 1;
    }

    function initModes() {
      const base = sigma();
      modes = MODES_N.map((d) => ({ x: d.x * W, y: d.y * H, w: d.w, rel: d.s, s: base * d.s }));
    }

    // seed every replica's particles inside ONE mode, so "swaps off" is visibly stuck
    function seedReplicas() {
      const m0 = modes[0] || { x: W * 0.2, y: H * 0.64, s: sigma() };
      replicas = [];
      for (let m = 0; m < M; m++) {
        const arr = [];
        for (let i = 0; i < ppr; i++) {
          arr.push({ x: m0.x + randn() * m0.s * 0.4, y: m0.y + randn() * m0.s * 0.4 });
        }
        replicas.push(arr);
      }
    }

    function setM(v) {
      M = v;
      buildBetas();
      seedReplicas();
      accEMA = -1;
      flashCtx.clearRect(0, 0, W, H);
      mLabel.innerHTML = 'replicas M: <b>' + M + '</b>';
      updateAcc();
    }
    function setPpr(v) {
      ppr = v;
      for (let m = 0; m < M; m++) {
        const arr = replicas[m];
        const m0 = modes[0];
        while (arr.length < v) arr.push({ x: m0.x + randn() * m0.s * 0.4, y: m0.y + randn() * m0.s * 0.4 });
        if (arr.length > v) arr.length = v;
      }
      pLabel.innerHTML = 'particles / replica: <b>' + v + '</b>';
    }
    function setSwapEvery(v) {
      swapEvery = v;
      sLabel.innerHTML = 'swap every: <b>' + v + '</b> steps';
    }
    function setSwaps(on) {
      swapsOn = on;
      accEMA = -1;
      btnOn.classList.toggle('active', on);
      btnOff.classList.toggle('active', !on);
      flashCtx.clearRect(0, 0, W, H);
      updateAcc();
    }
    function updateAcc() {
      if (!swapsOn) { acc.innerHTML = 'swaps off — cold chain is on its own'; return; }
      acc.innerHTML = accEMA < 0
        ? 'swap accept: <b>—</b>'
        : 'swap accept: <b>' + Math.round(accEMA * 100) + '%</b>';
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
      if (out) { out.x = gx; out.y = gy; }
      return maxLog + Math.log(Z);   // = log p̃ (unnormalized);  U = -this
    }

    function step() {
      const sig = sigma();
      const hBase = sig * sig * HF;

      // one ULA step per replica at its own temperature
      for (let m = 0; m < M; m++) {
        const beta = betas[m];
        const h = hBase / beta;
        const sqrt2h = Math.sqrt(2 * h);
        const arr = replicas[m];
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          evalp(p.x, p.y, g);
          let nx = p.x + h * beta * g.x + sqrt2h * randn();
          let ny = p.y + h * beta * g.y + sqrt2h * randn();
          p.x = reflect(nx, 2, W - 2);
          p.y = reflect(ny, 2, H - 2);
        }
      }

      // fade the swap-in flash layer each step
      flashCtx.globalCompositeOperation = 'destination-out';
      flashCtx.fillStyle = 'rgba(0,0,0,0.14)';
      flashCtx.fillRect(0, 0, W, H);
      flashCtx.globalCompositeOperation = 'source-over';
      flashCtx.fillStyle = 'rgba(110,231,255,0.95)';

      // periodic adjacent-pair exchange, alternating parity
      if (swapsOn && M >= 2 && (tickCount % swapEvery) === 0) {
        let nAcc = 0, nTot = 0;
        const par = swapParity;
        swapParity ^= 1;
        const n = Math.min(...replicas.map((a) => a.length));
        for (let m = par; m < M - 1; m += 2) {
          const bm = betas[m], bm1 = betas[m + 1];
          const A = replicas[m], B = replicas[m + 1];
          const cold = (m + 1 === M - 1);          // is the colder of the pair the β=1 rung?
          for (let i = 0; i < n; i++) {
            // U = -log p̃
            const Um = -evalp(A[i].x, A[i].y, null);
            const Um1 = -evalp(B[i].x, B[i].y, null);
            const logAlpha = (bm - bm1) * (Um - Um1);
            nTot++;
            if (Math.log(Math.random()) < logAlpha) {
              const tx = A[i].x, ty = A[i].y;
              A[i].x = B[i].x; A[i].y = B[i].y;
              B[i].x = tx; B[i].y = ty;
              nAcc++;
              if (cold) {                            // a swap brought a hot config into β=1: flash it
                const fx = Math.max(2, Math.min(W - 2, B[i].x));
                const fy = Math.max(2, Math.min(H - 2, B[i].y));
                flashCtx.beginPath();
                flashCtx.arc(fx, fy, 3.2, 0, TWO_PI);
                flashCtx.fill();
              }
            }
          }
        }
        if (nTot > 0) {
          const rate = nAcc / nTot;
          accEMA = accEMA < 0 ? rate : accEMA * 0.9 + rate * 0.1;
        }
      }
      tickCount++;
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

    // warm tint for a hot replica, fading from orange (hottest) toward the accent (coldest)
    function hotColor(frac) {
      // frac in [0,1): 0 = hottest. interpolate orange -> soft amber, low alpha.
      const r = 248, gch = Math.round(160 + 40 * frac), b = Math.round(80 + 60 * frac);
      const a = 0.18 + 0.10 * frac;
      return 'rgba(' + r + ',' + gch + ',' + b + ',' + a.toFixed(3) + ')';
    }

    function draw() {
      // hotter replicas: faint warm dots, fully repainted each frame
      hotCtx.clearRect(0, 0, W, H);
      for (let m = 0; m < M - 1; m++) {
        const frac = (M <= 2) ? 0 : m / (M - 2);
        hotCtx.fillStyle = hotColor(frac);
        const arr = replicas[m];
        for (let i = 0; i < arr.length; i++) {
          hotCtx.beginPath();
          hotCtx.arc(arr[i].x, arr[i].y, 2.0, 0, TWO_PI);
          hotCtx.fill();
        }
      }

      // cold replica: bright trail
      coldCtx.globalCompositeOperation = 'destination-out';
      coldCtx.fillStyle = 'rgba(0,0,0,0.09)';
      coldCtx.fillRect(0, 0, W, H);
      coldCtx.globalCompositeOperation = 'source-over';
      coldCtx.fillStyle = cssVar('--accent') || '#6ee7ff';
      const coldArr = replicas[M - 1] || [];
      for (let i = 0; i < coldArr.length; i++) {
        coldCtx.beginPath();
        coldCtx.arc(coldArr[i].x, coldArr[i].y, 2.1, 0, TWO_PI);
        coldCtx.fill();
      }

      ctx.clearRect(0, 0, W, H);
      if (heatDirty) renderHeat();
      ctx.drawImage(heat, 0, 0, W, H);
      ctx.drawImage(hot, 0, 0, W, H);
      ctx.drawImage(flash, 0, 0, W, H);
      ctx.drawImage(cold, 0, 0, W, H);

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
      if (running && !reduced) {
        step(); draw();
        if ((++frameNo % 12) === 0) updateAcc();
      }
      requestAnimationFrame(frame);
    }

    function resize() {
      const w = Math.max(280, Math.round(host.clientWidth));
      const h = Math.round(w * 0.6);
      const oldW = W, oldH = H;
      W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, hot, cold, flash]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      coldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      heat.width = HEAT_W;
      heat.height = Math.max(2, Math.round(HEAT_W * H / W));
      if (oldW > 0) {
        const ssx = W / oldW, ssy = H / oldH, base = sigma();
        for (const m of modes) { m.x *= ssx; m.y *= ssy; m.s = base * m.rel; }
        for (const arr of replicas) for (const p of arr) { p.x *= ssx; p.y *= ssy; }
      }
      if (modes.length === 0) initModes();
      if (replicas.length === 0) { buildBetas(); seedReplicas(); }
      heatDirty = true;
    }

    function staticRender() {
      for (let i = 0; i < 600; i++) step();
      coldCtx.clearRect(0, 0, W, H);
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
    btnOff.addEventListener('click', () => setSwaps(false));
    btnOn.addEventListener('click', () => setSwaps(true));
    mSlider.addEventListener('input', () => setM(parseInt(mSlider.value, 10)));
    sSlider.addEventListener('input', () => setSwapEvery(parseInt(sSlider.value, 10)));
    pSlider.addEventListener('input', () => setPpr(parseInt(pSlider.value, 10)));

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
      coldCtx.clearRect(0, 0, W, H);
      flashCtx.clearRect(0, 0, W, H);
      if (reduced) staticRender();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- go ----
    resize();
    setM(M);
    setPpr(ppr);
    setSwapEvery(swapEvery);
    setSwaps(true);
    if (reduced) staticRender();
    else requestAnimationFrame(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-widget="' + NAME + '"]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
