[Annealed Langevin](post.html?slug=annealed-langevin) finally got us *between*
well-separated modes: soften the target into a flat blob, let the particles spread
out while crossing is cheap, then slowly cool back down to $p$. It crosses
barriers — but it cheats. Because we cool on a *finite* schedule and each level
runs only a few un-converged MCMC steps, the particles never quite keep up with
the moving target. The cloud you end up with at $\beta = 1$ is **biased**: the mode
heights are off, exactly the way [ULA](post.html?slug=overdamped-langevin) was off
before [MALA](post.html?slug=mala) came along.

We have seen this movie. ULA was a biased discretization, and MALA fixed it not by
slowing down but by *bookkeeping* — adding an accept/reject correction. This post
plays the same move at the level of the whole annealing run. We will carry a
**population** of particles and attach to each one an **importance weight** that
records exactly how much it lagged the schedule. The weights make the estimate
unbiased; a resampling step keeps the population from rotting. Together they are
**Annealed Importance Sampling (AIS)** and **Sequential Monte Carlo (SMC)**.

## The annealing path, with receipts

Fix a schedule $\beta_0 = 0 < \beta_1 < \dots < \beta_K = 1$ and the geometric
bridge between a flat reference and the target:

$$
p_{\beta}(x) \;\propto\; \tilde p(x)^{\beta} ,
\qquad
p_{\beta_0} = \text{flat}, \quad p_{\beta_K} \propto \tilde p .
$$

Start a swarm of particles $\{x^{(i)}\}$ from $p_{\beta_0}$, each with weight
$w^{(i)} = 1$. Now sweep $k = 0, 1, \dots, K-1$, and at every level do two things:

- **Move.** Push each particle with an MCMC kernel (here, a couple of MALA steps)
  that targets the *current* bridge $p_{\beta_k}$. This is just annealed Langevin —
  nothing new.
- **Reweight.** Multiply each particle's weight by the **incremental ratio** of the
  two adjacent bridges, evaluated at that particle:

$$
w^{(i)} \;\mathrel{\ast}{=}\;
\frac{p_{\beta_{k+1}}\!\big(x^{(i)}\big)}{p_{\beta_k}\!\big(x^{(i)}\big)}
= \exp\!\Big( (\beta_{k+1} - \beta_k)\,\log \tilde p\big(x^{(i)}\big) \Big).
$$

That second line is the whole idea. The exponent is the increment in inverse
temperature times the (unnormalized) log-density of the point — and as with every
sampler in this series, the **normalizer cancels**, so $Z$ is never needed. A
particle sitting on a high-probability spot gains weight as we cool; one stranded
in the void loses it. The weight is a running receipt of how well each particle
tracked the cooling target.

By the time we reach $\beta_K = 1$, the weighted cloud
$\{(x^{(i)}, w^{(i)})\}$ is an **unbiased** importance-weighted sample from $p$.
Any expectation is estimated by the self-normalized average
$\sum_i w^{(i)} f(x^{(i)}) / \sum_i w^{(i)}$. The lag that biased plain annealing is
no longer ignored — it has been *measured* and folded into the weights.

## Why the weights are exactly right

The clean way to see it: AIS is ordinary importance sampling on an *extended* space
of whole trajectories $x_{0:K}$. The forward process (sample from the reference,
then apply the move kernels) defines a distribution over trajectories; a cleverly
chosen *backward* process defines the target over the same trajectories. Their
ratio telescopes — almost everything cancels between adjacent levels — and what
survives is precisely the product of incremental ratios above. Because it is an
honest importance-sampling identity, the estimator is unbiased for *any* schedule
and *any* amount of mixing, however crude. Better mixing and more levels do not buy
correctness; they only buy lower variance. (As a bonus, the same weights give you
an unbiased estimate of $Z$ itself — handy, but a story for another day.)

So far this is AIS: move, reweight, repeat. The catch is what happens to the
weights.

## Degeneracy, and the resampling fix

Importance weights are multiplicative, and multiplicative noise compounds. After
enough levels, one lucky particle's weight dwarfs all the others; the rest carry
essentially zero. Your population of $N$ particles is, statistically, worth a
handful. The standard diagnostic is the **effective sample size**

$$
\mathrm{ESS} = \frac{\big(\sum_i w^{(i)}\big)^2}{\sum_i \big(w^{(i)}\big)^2}
\;\in\; [1, N],
$$

which is $N$ when the weights are uniform and collapses toward $1$ when a single
particle hoards them. A degenerate ESS means the answer rides on one or two
samples — unbiased, yes, but uselessly high-variance.

The repair is **resampling**, and it is the step that turns AIS into SMC. Whenever
the ESS falls below a threshold (we use $N/2$), draw a fresh population of $N$
particles *with replacement, in proportion to the current weights*, and **reset
every weight to $1$**. Heavy particles get copied many times; weightless ones are
culled. The population now sits where the probability mass actually is, with even
weights, ready to spread out again under the move kernel.

Resampling is unbiased — it just trades a high-variance weighted sample for an
equal-in-expectation unweighted one — and it stops the compounding before it
ruins you. It is the population-level analogue of MALA's accept/reject: a cheap
bookkeeping move that keeps the method honest in practice, not just in the limit.

## Watch it run

<div class="smc-demo" data-widget="smc"></div>

The swarm starts flat at $\beta = 0$ and is annealed toward $\beta = 1$; each
particle's **dot size grows with its weight**, and the bar tracks the **ESS**.

Turn **resampling off** and watch the classic failure: as $\beta$ climbs, the
weight piles onto a few fat dots while everything else shrinks to pinpricks, and
the ESS bar drains into the red. The cloud is technically unbiased but is really
just two or three particles in a trenchcoat. Now switch **resampling on**. When the
ESS crosses below half, the population resamples (a red flash), the fat dots are
copied, the strays are dropped, and the weights flatten — the bar jumps back up. The
result is a healthy, evenly weighted cloud covering **all three modes in the right
proportions**, the unbiased answer that plain annealing could not deliver. Push the
**steps $K$** up for a gentler schedule (smaller weight jumps, less frequent
resampling) and the particle slider for a bigger, smoother population.

## Where it falls short

AIS and SMC are genuinely strong — they are how people compute normalizing
constants and sample stubborn posteriors — but the demo hints at the seams:

- **Resampling kills diversity.** Every resample *duplicates* particles, so right
  after one the population holds many identical copies. Only the move kernel
  re-diversifies them, and if mixing at that temperature is poor, you are left with
  a few distinct values wearing $N$ name tags. This is **path degeneracy**: trace
  the ancestry far enough back and the whole population often descends from a single
  early particle.
- **The schedule still matters.** Correctness is free, but variance is not. Too few
  intermediate steps and the incremental ratios swing wildly, the ESS face-plants
  every level, and you resample constantly; too many and you are just burning
  compute. A good annealing schedule (and good per-level mixing) is the real art.
- **It inherits its kernel's weaknesses.** SMC coordinates a population, but each
  particle still moves by some MCMC kernel. If that kernel cannot cross a barrier,
  resampling can only *re-allocate* particles among modes it already found — it
  cannot conjure a particle in a mode the swarm never visited.

That last point is the opening for the next idea. Instead of one population marching
along a single temperature ladder, run **several chains at different fixed
temperatures at once** and let them *swap* states: a hot, free-roaming chain feeds
fresh configurations to the cold chain pinned on $p$. No schedule to cool, no
weights to watch degenerate — just a clever exchange.

*Next up: parallel tempering — many temperatures at once, swapping their way across the modes.*
