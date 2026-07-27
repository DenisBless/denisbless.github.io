/* ============================================================
   Denis Blessing — site logic
   (publication data + rendering, filters, theme, name-denoise
   effect, scroll reveals, footer counter)
   ============================================================ */

(function () {
  'use strict';

  const ME = 'Denis Blessing';

  // Debug/screenshot helper: ?flat=1 shows all reveal blocks immediately
  // and disables smooth scrolling so static captures land on the right anchor.
  const FLAT = new URLSearchParams(location.search).get('flat') === '1';
  if (FLAT) {
    document.documentElement.style.scrollBehavior = 'auto';
    const s = document.createElement('style');
    s.textContent = '.hero{min-height:600px!important}';
    document.head.appendChild(s);
    // main.js executes at end of <body>, so the DOM is already parsed here.
    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal').forEach((e) => e.classList.add('visible'));
    });
  }

  /* ---------------- publication data ----------------
     authors: '*' marks equal contribution. tags:
     sampling | robot | first ("first" = first or co-first author) */

  const PUBS = [
    {
      title: 'ATLAS: A Foundation Neural Sampler for Amorphous Materials',
      authors: 'Mouyang Cheng*, Denis Blessing*, Botao Yu, Gerhard Neumann, Mingda Li, Carles Domingo-Enrich, Yuanqi Du',
      venue: 'Preprint', venueClass: 'preprint', venueFull: 'arXiv preprint', year: 2026,
      arxiv: '2607.19198', tags: ['sampling', 'first'],
      abstract: 'TL;DR: A foundation neural sampler that learns a diffusion process to generate Boltzmann-distributed amorphous structures directly from an energy function, generalizing across system size, temperature and composition.',
    },
    {
      title: 'Scalable Maximum Entropy Reinforcement Learning for Diffusion Policies via Adjoint Matching',
      authors: 'Serge Thilges, Onur Celik, Denis Blessing, Emiliyan Gospodinov, Gerhard Neumann',
      venue: 'Preprint', venueClass: 'preprint', venueFull: 'arXiv preprint', year: 2026,
      arxiv: '2606.22630', tags: ['robot', 'sampling'],
      abstract: 'TL;DR: Adjoint matching enables simulation-free training of diffusion policies for online maximum entropy RL, avoiding likelihood estimation and backpropagation through the diffusion process.',
    },
    {
      title: 'Trust-Region Diffusion Policies for Massively Parallel On-Policy RL',
      authors: 'Huy Le, Onur Celik, Denis Blessing, Tai Hoang, Claas A Voelcker, Axel Brunnbauer, Felix Richter, Michael Volpp, Gerhard Neumann',
      venue: 'ICML', venueClass: 'icml', venueFull: 'International Conference on Machine Learning (ICML)', year: 2026,
      arxiv: '2606.15260', tags: ['robot'],
      abstract: 'TL;DR: TruDi trains diffusion policies in the massively parallel on-policy regime by enforcing a KL trust region over the entire diffusion trajectory, evaluated on 73 tasks across 4 benchmarks.',
    },
    {
      title: 'Bridge Matching Sampler: Scalable Sampling via Generalized Fixed-Point Diffusion Matching',
      authors: 'Denis Blessing, Lorenz Richter, Julius Berner, Egor Malitskiy, Gerhard Neumann',
      venue: 'ICML', venueClass: 'icml', venueFull: 'International Conference on Machine Learning (ICML)', year: 2026,
      arxiv: '2603.00530', tags: ['sampling', 'first'],
      abstract: 'TL;DR: A scalable fixed-point objective for diffusion-based transport between arbitrary distributions, applied to sampling from unnormalized densities.',
    },
    {
      title: 'Learning Boltzmann Generators via Constrained Mass Transport',
      authors: 'Christopher von Klitzing, Denis Blessing*, Henrik Schopmans*, Pascal Friederich, Gerhard Neumann',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2026,
      arxiv: '2510.18460', tags: ['sampling', 'first'],
      abstract: 'TL;DR: A constrained mass transport framework for learning Boltzmann generators that samples high-dimensional, multimodal distributions without mode collapse.',
    },
    {
      title: 'MaNGO — Adaptable Graph Network Simulators via Meta-Learning',
      authors: 'Philipp Dahlinger, Tai Hoang, Denis Blessing, Niklas Freymuth, Gerhard Neumann',
      venue: 'NeurIPS', venueClass: 'neurips', venueFull: 'Advances in Neural Information Processing Systems (NeurIPS)', year: 2025,
      arxiv: '2510.05874', tags: [],
      links: [{ label: 'Project', url: 'https://alrhub.github.io/mango/' }],
      abstract: 'TL;DR: Meta-learning for graph network simulators: fast adaptation to unseen physical material properties without retraining, via conditional neural processes.',
    },
    {
      title: 'Trust Region Constrained Measure Transport in Path Space for Stochastic Optimal Control and Inference',
      authors: 'Denis Blessing, Julius Berner*, Lorenz Richter*, Carles Domingo-Enrich*, Yuanqi Du, Arash Vahdat, Gerhard Neumann',
      venue: 'NeurIPS', venueClass: 'neurips', venueFull: 'Advances in Neural Information Processing Systems (NeurIPS)', year: 2025,
      award: 'Spotlight',
      arxiv: '2508.12511', tags: ['sampling', 'first'],
      abstract: 'TL;DR: Trust-region constrained measure transport in path space: solving stochastic optimal control and inference problems through iteratively constrained geometric annealing.',
    },
    {
      title: 'Scaffolding Dexterous Manipulation with Vision-Language Models',
      authors: 'Vincent de Bakker, Joey Hejna, Tyler Ga Wei Lum, Onur Celik, Aleksandar Taranovic, Denis Blessing, Gerhard Neumann, Jeannette Bohg, Dorsa Sadigh',
      venue: 'NeurIPS', venueClass: 'neurips', venueFull: 'Advances in Neural Information Processing Systems (NeurIPS)', year: 2025,
      arxiv: '2506.19212', tags: ['robot'],
      code: 'https://github.com/vdebakker/vlm-scaffolding',
      abstract: 'TL;DR: Vision-language models generate task scaffolds that guide reinforcement learning of dexterous robotic manipulation policies.',
    },
    {
      title: 'Underdamped Diffusion Bridges with Applications to Sampling',
      authors: 'Denis Blessing*, Julius Berner*, Lorenz Richter*, Gerhard Neumann',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2025,
      arxiv: '2503.01006', tags: ['sampling', 'first'],
      abstract: 'TL;DR: A general framework for learning diffusion bridges with underdamped (second-order) dynamics, achieving state-of-the-art performance on sampling benchmarks.',
    },
    {
      title: 'End-to-End Learning of Gaussian Mixture Priors for Diffusion Samplers',
      authors: 'Denis Blessing, Xiaogang Jia, Gerhard Neumann',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2025,
      arxiv: '2503.00524', tags: ['sampling', 'first'],
      abstract: 'TL;DR: Learning expressive Gaussian mixture priors end-to-end improves exploration and reduces mode collapse in diffusion-based samplers. (The hero animation of this website is a loose 2D homage.)',
    },
    {
      title: 'X-IL: Exploring the Design Space of Imitation Learning Policies',
      authors: 'Xiaogang Jia, Atalay Donat, Xi Huang, Xuan Zhao, Denis Blessing, Hongyi Zhou, Han A. Wang, Hanyi Zhang, Qian Wang, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'ICLR-W', venueClass: 'iclr', venueFull: 'ICLR Workshop on Robot Learning', year: 2025,
      arxiv: '2502.12330', tags: ['robot'],
      code: 'https://github.com/ALRhub/X_IL',
      abstract: 'TL;DR: A modular open-source framework for systematically exploring imitation-learning design choices (encoders, backbones, policy representations), surfacing novel high-performing configurations.',
    },
    {
      title: 'Towards Fusing Point Cloud and Visual Representations for Imitation Learning',
      authors: 'Atalay Donat, Xiaogang Jia, Xi Huang, Aleksandar Taranovic, Denis Blessing, Ge Li, Hongyi Zhou, Hanyi Zhang, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'Preprint', venueClass: 'preprint', venueFull: 'arXiv preprint', year: 2025,
      arxiv: '2502.12320', tags: ['robot'],
      abstract: 'TL;DR: Effectively combining point-cloud and RGB modalities for manipulation via adaptive layer-norm conditioning.',
    },
    {
      title: 'DIME: Diffusion-Based Maximum Entropy Reinforcement Learning',
      authors: 'Onur Celik, Zechu Li, Denis Blessing, Ge Li, Daniel Palenicek, Jan Peters, Georgia Chalvatzaki, Gerhard Neumann',
      venue: 'ICML', venueClass: 'icml', venueFull: 'International Conference on Machine Learning (ICML)', year: 2025,
      arxiv: '2502.02316', tags: ['robot', 'sampling'],
      abstract: 'TL;DR: Bringing expressive diffusion policies into maximum entropy RL with a principled exploration objective.',
    },
    {
      title: 'Sequential Controlled Langevin Diffusions',
      authors: 'Junhua Chen*, Lorenz Richter*, Julius Berner*, Denis Blessing*, Gerhard Neumann, Anima Anandkumar',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2025,
      arxiv: '2412.07081', tags: ['sampling', 'first'],
      abstract: 'TL;DR: Combining the best of sequential Monte Carlo and learned diffusion samplers into a single principled framework.',
    },
    {
      title: 'Variational Distillation of Diffusion Policies into Mixture of Experts',
      authors: 'Hongyi Zhou, Denis Blessing, Ge Li, Onur Celik, Xiaogang Jia, Gerhard Neumann, Rudolf Lioutikov',
      venue: 'NeurIPS', venueClass: 'neurips', venueFull: 'Advances in Neural Information Processing Systems (NeurIPS)', year: 2024,
      arxiv: '2406.12538', tags: ['robot'],
      code: 'https://github.com/intuitive-robots/vdd',
      abstract: 'TL;DR: Distilling slow diffusion policies into fast mixtures of experts while preserving their expressiveness.',
    },
    {
      title: 'MaIL: Improving Imitation Learning with Selective State Space Models',
      authors: 'Xiaogang Jia, Qian Wang, Atalay Donat, Bowen Xing, Ge Li, Hongyi Zhou, Onur Celik, Denis Blessing, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'CoRL', venueClass: 'corl', venueFull: 'Conference on Robot Learning (CoRL)', year: 2024,
      arxiv: '2406.08234', tags: ['robot'],
      code: 'https://github.com/ALRhub/MaIL',
      abstract: 'TL;DR: Mamba-based imitation learning that outperforms Transformer policies in the small-data regime.',
    },
    {
      title: 'Beyond ELBOs: A Large-Scale Evaluation of Variational Methods for Sampling',
      authors: 'Denis Blessing, Xiaogang Jia, Johannes Esslinger, Francisco Vargas, Gerhard Neumann',
      venue: 'ICML', venueClass: 'icml', venueFull: 'International Conference on Machine Learning (ICML)', year: 2024,
      arxiv: '2406.07423', tags: ['sampling', 'first'],
      code: 'https://github.com/DenisBless/variational_sampling_methods',
      abstract: 'Monte Carlo methods, Variational Inference, and their combinations play a pivotal role in sampling from intractable probability distributions. However, current studies lack a unified evaluation framework, relying on disparate performance measures and limited method comparisons across diverse tasks, complicating the assessment of progress and hindering the decision-making of practitioners. In response to these challenges, our work introduces a benchmark that evaluates sampling methods using a standardized task suite and a broad range of performance criteria. Moreover, we study existing metrics for quantifying mode collapse and introduce novel metrics for this purpose. Our findings provide insights into strengths and weaknesses of existing sampling methods, serving as a valuable reference for future developments.',
    },
    {
      title: 'Towards Diverse Behaviors: A Benchmark for Imitation Learning with Human Demonstrations',
      authors: 'Xiaogang Jia, Denis Blessing, Xinkai Jiang, Moritz Reuss, Atalay Donat, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2024,
      arxiv: '2402.14606', tags: ['robot'],
      code: 'https://github.com/ALRhub/d3il',
      abstract: 'TL;DR: D3IL — simulation benchmarks, datasets of diverse human demonstrations, and tractable metrics for evaluating how well imitation learning methods capture multimodal behavior.',
    },
    {
      title: 'Transport Meets Variational Inference: Controlled Monte Carlo Diffusions',
      authors: 'Francisco Vargas, Shreyas Padhy, Denis Blessing, Nikolas Nüsken',
      venue: 'ICLR', venueClass: 'iclr', venueFull: 'International Conference on Learning Representations (ICLR)', year: 2024,
      arxiv: '2307.01050', tags: ['sampling'],
      code: 'https://github.com/shreyaspadhy/CMCD',
      abstract: 'Connecting optimal transport and variational inference, we present a principled and systematic framework for sampling and generative modelling centred around divergences on path space. Our work culminates in the development of the Controlled Monte Carlo Diffusion sampler (CMCD) for Bayesian computation, a score-based annealing technique that crucially adapts both forward and backward dynamics in a diffusion model. On the way, we clarify the relationship between the EM-algorithm and iterative proportional fitting (IPF) for Schrödinger bridges, and show that CMCD has a strong foundation in the Jarzynski and Crooks identities from statistical physics.',
    },
    {
      title: 'Curriculum-Based Imitation of Versatile Skills',
      authors: 'Maximilian Xiling Li, Onur Celik, Philipp Becker, Denis Blessing, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'ICRA', venueClass: 'icra', venueFull: 'IEEE International Conference on Robotics and Automation (ICRA)', year: 2023,
      arxiv: '2304.05171', tags: ['robot'],
      abstract: 'TL;DR: Curriculum-based data weighting with a mixture of linear experts for imitating multimodal human demonstrations, on simulated and real robots.',
    },
    {
      title: 'Information Maximizing Curriculum: A Curriculum-Based Approach for Imitating Diverse Skills',
      authors: 'Denis Blessing, Onur Celik, Xiaogang Jia, Moritz Reuss, Maximilian Xiling Li, Rudolf Lioutikov, Gerhard Neumann',
      venue: 'NeurIPS', venueClass: 'neurips', venueFull: 'Advances in Neural Information Processing Systems (NeurIPS)', year: 2023,
      arxiv: '2303.15349', tags: ['robot', 'first'],
      code: 'https://github.com/ALRhub/imc',
      abstract: 'Imitation learning with human data often leads to multimodal distributions because of the variability in human actions. Most methods rely on a maximum likelihood objective, which can result in suboptimal or unsafe behavior due to mode-averaging. We propose Information Maximizing Curriculum, a curriculum-based approach that assigns a weight to each data point and encourages the model to specialize in the data it can represent. To cover all modes, we extend the approach to a mixture of experts policy with a maximum-entropy-based objective, achieving superior performance on complex simulated control tasks with diverse human demonstrations.',
    },
  ];

  /* ---------------- render publications ---------------- */

  const pubList = document.getElementById('pub-list');

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderAuthors(authors) {
    return authors.split(', ').map((a) => {
      const star = a.endsWith('*');
      const name = star ? a.slice(0, -1) : a;
      const html = escapeHtml(name) + (star ? '<sup>*</sup>' : '');
      return name === ME ? `<span class="me">${html}</span>` : html;
    }).join(', ');
  }

  function bibtex(p) {
    const authors = p.authors.split(', ').map((a) => a.replace(/\*$/, '')).join(' and ');
    const firstAuthor = p.authors.split(', ')[0].replace(/\*$/, '').split(' ').pop().toLowerCase();
    const firstWord = p.title.toLowerCase().match(/[a-z]+/)[0];
    const key = `${firstAuthor}${p.year}${firstWord}`;
    if (p.venueClass === 'preprint') {
      return `@misc{${key},
  title         = {${p.title}},
  author        = {${authors}},
  year          = {${p.year}},
  eprint        = {${p.arxiv}},
  archivePrefix = {arXiv},
  url           = {https://arxiv.org/abs/${p.arxiv}}
}`;
    }
    return `@inproceedings{${key},
  title     = {${p.title}},
  author    = {${authors}},
  booktitle = {${p.venueFull}},
  year      = {${p.year}},
  url       = {https://arxiv.org/abs/${p.arxiv}}
}`;
  }

  function render() {
    const years = [...new Set(PUBS.map((p) => p.year))].sort((a, b) => b - a);
    let html = '';
    years.forEach((year) => {
      html += `<div class="pub-year-group" data-year="${year}"><h3 class="pub-year">${year}</h3>`;
      PUBS.filter((p) => p.year === year).forEach((p) => {
        const idx = PUBS.indexOf(p);
        const award = p.award ? `<span class="award-badge">★ ${p.award}</span>` : '';
        const codeLink = p.code ? `<a class="pub-link" href="${p.code}" target="_blank" rel="noopener">code</a>` : '';
        const extraLinks = (p.links || []).map((l) =>
          `<a class="pub-link" href="${l.url}" target="_blank" rel="noopener">${l.label.toLowerCase()}</a>`).join('');
        html += `
        <article class="pub-card" data-tags="${p.tags.join(' ')}">
          <div class="pub-venue-col">
            <span class="venue-badge venue-${p.venueClass}">${p.venue}${p.venueClass !== 'preprint' ? ' ' + p.year : ''}</span>
            ${award}
          </div>
          <div>
            <h4 class="pub-title">${escapeHtml(p.title)}</h4>
            <p class="pub-authors">${renderAuthors(p.authors)}</p>
            <div class="pub-links">
              <a class="pub-link" href="https://arxiv.org/abs/${p.arxiv}" target="_blank" rel="noopener">arXiv</a>
              ${codeLink}${extraLinks}
              <button class="pub-link abs-btn" data-idx="${idx}">abstract</button>
              <button class="pub-link bib-btn" data-idx="${idx}">bibtex</button>
            </div>
            <div class="pub-abstract">${escapeHtml(p.abstract)}</div>
          </div>
        </article>`;
      });
      html += '</div>';
    });
    pubList.innerHTML = html;
  }

  render();

  // abstract toggle + bibtex copy (event delegation)
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  pubList.addEventListener('click', (e) => {
    const absBtn = e.target.closest('.abs-btn');
    if (absBtn) {
      absBtn.closest('.pub-card').classList.toggle('open');
      return;
    }
    const bibBtn = e.target.closest('.bib-btn');
    if (bibBtn) {
      const text = bibtex(PUBS[parseInt(bibBtn.dataset.idx)]);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => showToast('BibTeX copied to clipboard'),
          () => showToast('Could not copy — sorry!')
        );
      } else {
        showToast('Clipboard not available');
      }
    }
  });

  /* ---------------- filters ---------------- */

  const filterBar = document.getElementById('pub-filters');

  function applyFilter(f) {
    document.querySelectorAll('.pub-card').forEach((card) => {
      const show = f === 'all' || card.dataset.tags.split(' ').includes(f);
      card.classList.toggle('hidden', !show);
    });
    // hide year headings with no visible papers
    document.querySelectorAll('.pub-year-group').forEach((group) => {
      const any = group.querySelector('.pub-card:not(.hidden)');
      group.style.display = any ? '' : 'none';
    });
  }

  filterBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    filterBar.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    applyFilter(chip.dataset.filter);
  });

  // apply whichever chip is active on load
  const initialChip = filterBar.querySelector('.filter-chip.active');
  if (initialChip) applyFilter(initialChip.dataset.filter);

  /* ---------------- theme toggle ---------------- */

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  /* ---------------- nav scrolled state ---------------- */

  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 12);
  }, { passive: true });

  /* ---------------- scroll reveals ---------------- */

  if ('IntersectionObserver' in window) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          ro.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => ro.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
  }

  /* ---------------- name "denoising" effect ----------------
     The h1 starts as random math-y glyphs and anneals into the
     actual name, character by character. */

  const nameEl = document.getElementById('hero-name');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (nameEl && !reducedMotion) {
    const target = nameEl.dataset.text || nameEl.textContent;
    const glyphs = '∂∇∫ΣΠΦΨΩαβγδθλμξπστφχψω0123456789';
    const t0 = performance.now();
    const totalMs = 1300;
    const lockAt = target.split('').map((_, i) => (i / target.length) * totalMs * 0.7 + 250);

    (function denoise(t) {
      const dt = t - t0;
      let out = '';
      let done = true;
      for (let i = 0; i < target.length; i++) {
        if (target[i] === ' ') { out += ' '; continue; }
        if (dt >= lockAt[i]) {
          out += target[i];
        } else {
          out += glyphs[Math.floor(Math.random() * glyphs.length)];
          done = false;
        }
      }
      nameEl.textContent = out;
      if (!done) requestAnimationFrame(denoise);
    })(t0);
  }

  /* ---------------- footer ---------------- */

  document.getElementById('year').textContent = new Date().getFullYear();

  const counter = document.getElementById('footer-counter');
  if (counter) {
    setInterval(() => {
      if (typeof window.__samplerSteps === 'function') {
        const n = window.__samplerSteps();
        counter.textContent = `⟨ the background sampler has taken ${n.toLocaleString('en-US')} Langevin steps since you arrived ⟩`;
      }
    }, 750);
  }
})();
