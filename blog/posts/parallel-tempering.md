[Annealed Langevin](post.html?slug=annealed-langevin) crossed between far-apart
modes by softening the target and cooling *one* chain over time; [sequential Monte
Carlo](post.html?slug=smc) instead carried a whole *population* down that same
temperature schedule, reweighting and resampling as it went. Both treat
temperature as something you move *through*: start hot, end cold, and the run is
over. This post keeps the temperatures but stops marching through them. We hold a
**fixed ladder** of temperatures, run a chain at each one *forever*, and let the
hot chains and the cold chain trade places.

## A ladder of replicas

Pick $M$ inverse temperatures

$$
\beta_1 < \beta_2 < \cdots < \beta_M = 1 ,
$$

and give each one its own **replica** — its own particle running an ordinary
Langevin chain, but against a *tempered* target

$$
p_{\beta_m}(x) \;\propto\; \tilde p(x)^{\beta_m} .
$$

Raising $\tilde p$ to a power $\beta < 1$ flattens it: barriers between modes
shrink, valleys fill in, and at the hottest rung the landscape is nearly featureless.
The cold rung, $\beta_M = 1$, is the genuine target $p$ — untouched. Each replica
just runs the score-driven walk from Part I against its own $p_{\beta_m}$,

$$
x \;\mathrel{+}=\; h_m\,\beta_m\,\nabla\log\tilde p(x) \;+\; \sqrt{2h_m}\;\xi ,
$$

so the hot replicas roam freely across the whole space while the cold replica,
left alone, stays trapped in whatever mode it started in. Nothing new yet — this is
just $M$ independent chains, and the cold one is exactly as stuck as plain Langevin.

## The swap

The one new ingredient is a periodic **exchange**. Every so often, pick two
adjacent replicas $m$ and $m+1$ and propose swapping their *configurations* — let
the hot particle take the cold particle's position and vice versa. We accept the
swap with a Metropolis rule, writing the potential as $U = -\log\tilde p$:

$$
\alpha \;=\; \min\!\Big(1,\; \exp\!\big[(\beta_m - \beta_{m+1})\,(U(x_m) - U(x_{m+1}))\big]\Big).
$$

That exponent is exactly the log-ratio of the joint density before and after the
swap, so the exchange is a valid Metropolis move on the **product** distribution
$\prod_m p_{\beta_m}$. Each replica therefore keeps marginally sampling its own
$p_{\beta_m}$ — and in particular, **the cold replica still samples $p$ exactly.**
Swapping changes nothing about *what* each rung targets; it only changes *which
configuration* sits there.

Read the rule intuitively. $\beta_m - \beta_{m+1} < 0$, so the swap is favoured
when $U(x_m) > U(x_{m+1})$ — when the hotter replica is currently sitting somewhere
*better* (lower energy) than the colder one. A hot chain that has wandered into a
new basin gets to hand that discovery down the ladder; a cold chain stuck in a
so-so spot gets pulled out of it.

## Why it works

Think of a single configuration as it gets passed around. Because adjacent rungs
swap, a particle can **random-walk in temperature**: drift up to the hottest rung,
hop across a barrier while the landscape is flat, then ride back down the ladder to
$\beta = 1$. The crossing that the cold chain could never afford on its own is done
for it, up where it is cheap, and laddered back down. Every mode the hot replicas
find becomes reachable at the cold rung.

The whole trick is that exactness and exploration are split across the ladder. The
cold rung guarantees correctness — its marginal is $p$, swaps or no swaps. The hot
rungs supply mobility. The swaps are the conveyor belt between them, and the
acceptance rule keeps that belt from corrupting either end.

Unlike annealing, nothing is ever "finished cooling": all $M$ chains run at once,
indefinitely, and you simply collect the cold replica's trajectory as your samples.
Tempering in *space* instead of in *time*.

## Watch it run

<div class="parallel-tempering-demo" data-widget="parallel-tempering"></div>

The bright particles are the **cold** ($\beta = 1$) replica — those are your real
samples — drawn over the true target. The fainter, warmer-tinted clouds are the
hotter replicas, roaming far more freely. Turn **swaps off** and the cold cloud
collapses into the single mode it happened to start in and stays there, exactly
like plain Langevin: correct locally, blind to the other modes. Turn **swaps on**
and watch the swap-ins flash: hot configurations ladder down, and within moments
the cold replica is visiting all three modes — and, crucially, in roughly the right
*proportions*, not just visiting them. Add **more replicas** to make the ladder
finer (adjacent rungs more alike, so swaps are accepted more often) and adjust the
**swap frequency** to trade exploration against the cost of all those exchanges.

## Where it falls short

Parallel tempering is the first method in this series that reliably gets the
**weights between far-apart modes right**, not just the shapes within them. But it
buys that with a ladder you have to design, and the ladder is where it bites back.

- **You pay for $M$ chains.** Only one of them — the cold rung — produces the
  samples you actually want. The other $M-1$ are pure overhead, scaffolding that
  exists only to ferry good configurations downward.
- **The ladder has to be tuned.** Adjacent temperatures must overlap enough that
  swaps are accepted often; space them too far apart and the exchange rate
  collapses, the conveyor belt stalls, and the cold chain is stuck again. Too
  close and you are paying for redundant rungs. A common rule of thumb aims for an
  adjacent-swap acceptance somewhere in the tens of percent, with a roughly
  geometric spacing — but the right number of rungs grows with dimension and with
  how nasty the target is, because energy fluctuations scale up and each swap
  spans a smaller temperature gap.
- **It still needs the hot chain to find the modes.** Tempering lowers the
  barriers; it does not guarantee the flattened landscape is easy. If a mode is so
  isolated that even the hottest rung rarely visits it, no swap can ladder it down
  — you cannot exchange a configuration nobody ever discovered.

Every sampler so far — Langevin, MALA, HMC, annealing, SMC, and now tempering —
has been some clever way of *running dynamics* on a fixed target. Each fixes a flaw
of the last, and each leaves a new knob to tune. The natural question to end on is
whether we can stop hand-designing dynamics altogether and instead **learn** a map
that pushes an easy distribution straight onto $p$ — turning sampling into an
optimization problem.

*Next up: learned and diffusion-based samplers — letting a neural network transport
noise onto the target, as the finale of the series.*
