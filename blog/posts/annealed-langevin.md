Every method so far has been *local*. [ULA](post.html?slug=overdamped-langevin) and
[MALA](post.html?slug=mala) shuffle in place; [underdamped
Langevin](post.html?slug=underdamped-langevin) adds momentum so it can *travel*, but
a high barrier between well-separated modes is still crossed only once in a blue
moon. The exponential-in-the-barrier metastability from Part I has survived three
posts untouched. This one finally goes after it — and it is the first method in the
series that genuinely hops between far-apart modes.

The idea is almost embarrassingly physical: if a landscape is too rugged to cross,
**heat it up until the hills melt, walk around freely, then cool back down.**

## Tempering: a temperature knob for a density

Take the target $p(x) \propto \tilde p(x) = \exp\big(\log \tilde p(x)\big)$ and raise
it to a power $\beta \in (0, 1]$ — the **inverse temperature**:

$$
p_\beta(x) \;\propto\; \tilde p(x)^{\beta} \;=\; \exp\!\big(\beta\,\log \tilde p(x)\big).
$$

Think of $\log \tilde p$ as minus an energy and $\beta = 1/T$ as inverse temperature:
tempering is exactly Boltzmann's $e^{-E/T}$ with the temperature dialled up. The two
ends are worth holding in your head:

- **$\beta = 1$ (cold, $T = 1$)** is the true target — every mode at its proper
  height, every valley at its proper depth.
- **$\beta \to 0$ (hot, $T \to \infty$)** flattens everything. $\tilde p^{\beta} \to 1$:
  the barriers vanish and the density approaches a featureless plateau a sampler can
  stroll across without resistance.

Now run plain overdamped ULA, but **anneal** $\beta$ from nearly $0$ up to $1$ as you
go. The one fact that makes this trivial to implement is that the score of the
tempered density is just the score of the original, scaled:

$$
\nabla \log p_\beta(x) \;=\; \beta\,\nabla \log \tilde p(x).
$$

So the only change to the ULA step is a $\beta$ multiplying the drift:

$$
x_{k+1} \;=\; x_k \;+\; h\,\beta_k\,\nabla \log \tilde p(x_k) \;+\; \sqrt{2h}\;\xi_k,
\qquad \xi_k \sim \mathcal N(0, I),
$$

with $\beta_k$ ramped along a schedule $\beta_0 \approx 0 \to \beta_K = 1$. When it is
hot the drift is weak and the noise dominates, so particles diffuse far and wide;
as it cools the drift reasserts itself and pulls them into the wells. (Equivalently,
you can leave the drift at full strength and put the temperature in the *noise*,
$\sqrt{2h/\beta}$ — same stationary law $p_\beta$ at each fixed $\beta$.)

## Why heating up lets it cross

At any *fixed* $\beta$, that update is just ULA targeting $p_\beta$, so its stationary
distribution is (give or take the usual $O(h)$ discretization bias) $p_\beta$ itself.
The point of tempering is what happens to the **barrier** between two modes. A
crossing rate is governed by an Arrhenius/Kramers factor,

$$
\text{rate} \;\sim\; \exp\!\big(-\beta\,\Delta\big),
$$

where $\Delta$ is the depth of the valley separating the modes in $\log \tilde p$.
At $\beta = 1$ that factor is exponentially small — which is precisely why local
samplers stall. But multiply the exponent by a small $\beta$ and the barrier shrinks
by the same factor; take $\beta$ small enough and $\exp(-\beta\Delta) \approx 1$.
The valley is *gone*, and a particle wanders between modes as easily as across open
ground.

So the recipe writes itself: spend the hot phase **redistributing** particles across
all the modes while crossing is free, then cool slowly enough that, as each barrier
re-forms, the population it traps reflects the mass the modes *deserve*. Cool too
fast and you skip that settling — more on that below.

## Watch it run

<div class="annealed-langevin-demo" data-widget="annealed-langevin"></div>

The heatmap is not the target — it is the *tempered* density $p_\beta$, recomputed
every frame, so you can watch it **melt flat** when hot and **sharpen** back to the
three modes when cold, over and over (the annealing loop re-heats and tries again).
Follow the particles: while the landscape is flat they roam everywhere and stream
freely between the wells — the mode-crossing ULA and MALA never managed. As $\beta$
climbs back toward $1$ they get **captured**, and where they settle is decided during
the hot, mobile phase. Watch the live $\beta$ (and temperature $T = 1/\beta$) readout
to see which phase you are in.

Now drag **annealing speed** to **slow** and let a few cycles complete: the cold
population spreads across the three modes in roughly their true proportions. Then
yank it to **fast** and watch the weights go visibly wrong — that is not a bug, it
is the whole catch, which deserves its own section.

## Where it falls short

Plain annealed Langevin is a **heuristic, not an exact sampler.** Nothing here
enforces detailed balance with respect to $p$; there is no Metropolis gate, no
invariance theorem. It usually lands *somewhere near* the target, and that is all the
guarantee you get. Three honest caveats:

- **Anneal too fast and you get the wrong weights.** The cooling has to be slow
  enough for the particle cloud to track the *moving* distribution $p_{\beta_k}$ as
  it sharpens. Cool faster than the population can re-equilibrate and particles
  freeze wherever they happened to be when each barrier slammed shut — the final
  mode occupancies come out distorted. The speed slider makes this concrete: slow is
  honest, fast is biased, and you can *see* the mode weights drift off as you push it.
- **Tempering itself reweights the modes — against the narrow ones.** Raising a
  density to a power $\beta < 1$ does not just lower barriers; it also reshapes the
  relative mass of the modes, because the per-mode normalizer scales like
  $(\sigma^2)^{1-\beta}$ and so *favours wide modes when hot*. A narrow, tall peak is
  systematically under-occupied at every $\beta < 1$ and only regains its rightful
  share exactly at $\beta = 1$ — by which point crossings may already be frozen out.
  In the demo the slim middle mode is the one that stays a touch under-weight even on
  a slow schedule. There is no free lunch: the very flattening that lets you cross is
  what biases the weights.
- **"Slow enough" has no thermometer.** How slow is slow enough depends on the
  barriers, which you generally do not know. There is no acceptance rate, no $\hat R$,
  nothing the algorithm itself can report to tell you the schedule was adequate.

What we are missing is the bookkeeping. The annealing path *does* contain enough
information to correct itself — every tempered step has a tractable density, so we
can track how much each particle's trajectory should be reweighted, and use those
weights to undo the bias exactly. Wrap the same $\beta_0 \to \beta_K$ sweep in an
importance-sampling ledger and the heuristic becomes a method with real guarantees.

*Next up: Annealed Importance Sampling and Sequential Monte Carlo — putting an exact
weight on every annealing path.*
