/* ============================================================
   Blog post index — the single source of truth for the blog.

   TO ADD A NEW POST:
     1. Write the body in   blog/posts/<slug>.md   (plain Markdown;
        inline math with $...$, display math with $$...$$, fenced
        code blocks ```python … ```, images ![alt](img.png), etc.).
        Do NOT repeat the title as an <h1> — it is rendered from the
        `title` field below.
     2. Add an entry to the TOP of the array below (newest first).

   Fields:
     slug    – filename without .md (also the ?slug= URL param)
     title   – post title
     date    – ISO date "YYYY-MM-DD" (used for ordering + display)
     summary – one-or-two line teaser shown on the blog index
     tags    – array of short topic tags (shown as #tag)
     scripts – (optional) widget scripts to load for this post; each
               self-mounts onto a <div data-widget="..."> in the body
   ============================================================ */

window.POSTS = [
  {
    slug: 'parallel-tempering',
    title: 'Sampling from the ground up — VII. Parallel tempering',
    date: '2026-06-14',
    summary:
      'Run a ladder of replicas at fixed temperatures and let hot and cold chains swap places. The hot rungs cross barriers; swaps ladder those crossings down to the cold chain — whose samples are the target, with the mode weights finally right.',
    tags: ['sampling', 'mcmc', 'tempering', 'series'],
    scripts: ['widgets/parallel-tempering.js'],
  },
  {
    slug: 'smc',
    title: 'Sampling from the ground up — VI. Annealed Importance Sampling & SMC',
    date: '2026-06-14',
    summary:
      'Annealing crosses between modes but ends up biased. Attach an importance weight to every particle to fix it exactly, track the effective sample size, and resample when it collapses — with the weight degeneracy (and its cure) shown live.',
    tags: ['sampling', 'mcmc', 'smc', 'series'],
    scripts: ['widgets/smc.js'],
  },
  {
    slug: 'annealed-langevin',
    title: 'Sampling from the ground up — V. Annealed Langevin & tempering',
    date: '2026-06-14',
    summary:
      'Heat the target until the barriers melt, let particles cross between far-apart modes, then cool back down — the first sampler in the series that actually mixes between modes, and an honest look at why plain annealing still gets the weights wrong.',
    tags: ['sampling', 'langevin', 'annealing', 'series'],
    scripts: ['widgets/annealed-langevin.js'],
  },
  {
    slug: 'hmc',
    title: 'Sampling from the ground up — IV. Hamiltonian Monte Carlo',
    date: '2026-06-14',
    summary:
      'Take momentum to its limit: draw a fresh velocity, follow a long energy-conserving trajectory, and Metropolis-correct. We derive HMC and watch the leapfrog arcs (and rejections) live.',
    tags: ['sampling', 'mcmc', 'hmc', 'series'],
    scripts: ['widgets/hmc.js'],
  },
  {
    slug: 'underdamped-langevin',
    title: 'Sampling from the ground up — III. Underdamped Langevin & momentum',
    date: '2026-06-14',
    summary:
      'Random walks are slow. Give the sampler momentum and it travels in straight lines instead — underdamped Langevin, with a friction slider that sweeps from ballistic to diffusive.',
    tags: ['sampling', 'langevin', 'series'],
    scripts: ['widgets/underdamped-langevin.js'],
  },
  {
    slug: 'mala',
    title: 'Sampling from the ground up — II. Fixing the bias with MALA',
    date: '2026-06-14',
    summary:
      'ULA is biased. A Metropolis accept/reject step removes that bias exactly, at any step size. We derive MALA, watch proposals get rejected interactively, and see what it still cannot do.',
    tags: ['sampling', 'langevin', 'mcmc', 'series'],
    scripts: ['widgets/mala.js'],
  },
  {
    slug: 'overdamped-langevin',
    title: 'Sampling from the ground up — I. Overdamped Langevin dynamics',
    date: '2026-06-14',
    summary:
      'How do you sample a distribution you only know up to a constant? We derive overdamped Langevin dynamics, see (interactively) why it works, and where it breaks.',
    tags: ['sampling', 'langevin', 'series'],
    scripts: ['widgets/overdamped-langevin.js'],
  },
  {
    slug: 'welcome',
    title: 'Welcome to the blog',
    date: '2026-06-14',
    summary:
      'What this space is for — and a quick tour of the formatting you get out of the box: math, code, figures and callouts.',
    tags: ['meta'],
  },
];
