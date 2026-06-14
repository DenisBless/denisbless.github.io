[Underdamped Langevin](post.html?slug=underdamped-langevin) showed that momentum
turns a random walk into directed motion. But it dribbles momentum in and out
through friction, and — like ULA — it is an uncorrected discretization, so it
carries a bias. **Hamiltonian Monte Carlo (HMC)** takes momentum to its logical
conclusion: draw a *fresh* velocity, follow a *long* trajectory that conserves
energy, and add a Metropolis test so the whole move is exact.

## Physics as a proposal

Augment $x$ with a momentum $v$ and define a Hamiltonian — a total energy that is
potential plus kinetic:

$$
H(x, v) = U(x) + \tfrac12\|v\|^2 , \qquad U(x) = -\log p(x).
$$

The corresponding Boltzmann distribution factorizes,

$$
\pi(x, v) \;\propto\; e^{-H(x,v)} = \underbrace{p(x)}_{\text{target}}\;
\underbrace{e^{-\frac12\|v\|^2}}_{\mathcal N(v;\,0,\,I)} ,
$$

so if we can sample $\pi$, the $x$-marginal is exactly our target $p$. HMC samples
$\pi$ with two alternating moves:

1. **Refresh the momentum:** draw $v \sim \mathcal N(0, I)$. (This alone leaves
   $\pi$ invariant, since $v$ is independent of $x$ under $\pi$.)
2. **Flow along the energy surface:** evolve $(x, v)$ under Hamilton's equations
   $$
   \dot x = \nabla_v H = v, \qquad \dot v = -\nabla_x H = \nabla \log p(x),
   $$
   for some time, then propose the endpoint.

Hamiltonian flow has two magic properties: it **conserves $H$** and it
**preserves volume** in $(x, v)$ space. So the proposed endpoint sits on the same
energy contour as the start — meaning $\pi$ is (almost) unchanged — even if it is
*far away*. That is how HMC makes long, directed jumps that a random walk could
never afford.

## Leapfrog and the Metropolis fix

We cannot solve Hamilton's equations exactly; we discretize them with the
**leapfrog** integrator, $L$ steps of size $\varepsilon$:

$$
v \mathrel{+}= \tfrac{\varepsilon}{2}\nabla\log p(x), \qquad
x \mathrel{+}= \varepsilon\, v, \qquad
v \mathrel{+}= \tfrac{\varepsilon}{2}\nabla\log p(x).
$$

Leapfrog is *symplectic*: it preserves volume exactly and is exactly reversible,
but it does **not** conserve $H$ perfectly — it drifts by a small amount that
grows with $\varepsilon$. We mop up that error with a Metropolis test on the
endpoint $(x', v')$:

$$
\alpha = \min\!\big(1,\; e^{\,H(x, v) - H(x', v')}\big).
$$

Volume-preservation and reversibility are exactly what make the proposal ratio
collapse to this clean energy difference. Because leapfrog nearly conserves $H$,
$H(x',v') \approx H(x,v)$ and the acceptance stays high *even for long
trajectories* — which is the whole point.

## Watch it run

<div class="hmc-demo" data-widget="hmc"></div>

Each particle draws a momentum and sets off along a curved, near-Hamiltonian arc
(drawn as it forms); at the end of the trajectory the Metropolis test keeps it or
**snaps it back** (red flash). Notice how a single accepted move can carry a
particle clear across the canvas — no random walk in sight. Now push **step size
$\varepsilon$** up: the leapfrog integrator can no longer track the energy surface,
$H$ drifts, and the acceptance rate visibly collapses. **Trajectory length $L$**
sets how far each proposal reaches before you test it.

## What HMC buys, and what still hurts

HMC is the workhorse behind modern probabilistic programming for good reason:

- **Long, high-acceptance moves.** Directed Hamiltonian trajectories suppress the
  random walk, so samples decorrelate far faster — and the advantage grows in high
  dimensions.
- **Exactness.** The Metropolis correction makes it unbiased for any
  $\varepsilon$, just like MALA.

The costs are the tuning knobs you just played with: $\varepsilon$ trades
acceptance against speed, and $L$ trades exploration against compute (too small is
a timid step; too large wastes gradients looping back on itself). In practice the
**No-U-Turn Sampler (NUTS)** picks $L$ for you, and step sizes are adapted
automatically — that is what runs inside Stan and PyMC.

But notice what the demo *cannot* do, however you tune it: reliably jump between
two **far-apart, well-separated modes**. A leapfrog trajectory conserves energy,
so to climb out of one deep basin and into another it would need a rare, large
momentum draw — the same exponential barrier from Part I, now dressed in momentum.
Momentum makes you fast *within* a basin; it does not, by itself, get you between
basins.

To cross genuinely separated modes we finally have to change the target itself —
soften it, cross while it is easy, and cool back down.

*Next up: tempering and annealed Langevin — actually crossing between far-apart modes.*
