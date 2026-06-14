[ULA](post.html?slug=overdamped-langevin) and [MALA](post.html?slug=mala) are both
*random walks*: at each step a particle is nudged by the score and then kicked by
fresh, independent noise. Random walks are slow — to wander a distance $L$ a
diffusion needs on the order of $L^2$ steps, because it keeps forgetting which way
it was going. The fix in this post is to give the sampler a **memory of its
direction**: momentum.

## Adding momentum

We enlarge the state with a velocity $v$ and write down a *second-order* dynamics —
the **underdamped Langevin** SDE:

$$
\mathrm{d}x = v\,\mathrm{d}t , \qquad
\mathrm{d}v = \nabla\log p(x)\,\mathrm{d}t \;-\; \gamma\,v\,\mathrm{d}t \;+\; \sqrt{2\gamma}\,\mathrm{d}W .
$$

Three forces act on the velocity: the score $\nabla\log p$ accelerates particles
toward high-probability regions, a **friction** $-\gamma v$ bleeds energy away, and
the noise $\sqrt{2\gamma}\,\mathrm{d}W$ pumps it back in. Friction and noise are
deliberately tied together by the same $\gamma$ — that balance (a
fluctuation–dissipation relation) is what fixes the temperature.

The pay-off is the stationary distribution:

$$
\pi(x, v) \;\propto\; p(x)\,\exp\!\big(-\tfrac12\|v\|^2\big).
$$

Position and velocity are independent at equilibrium, and the **position marginal
is exactly $p$** — for *any* friction $\gamma$. So $\gamma$ is a free dial that
changes *how* we explore without changing *what* we sample.

## What friction does

The friction interpolates between two regimes:

- **Large $\gamma$ — the overdamped limit.** Velocity is reset almost every instant,
  so the momentum never builds up and we recover the diffusive walk of Part I.
- **Small $\gamma$ — the ballistic limit.** Energy barely dissipates; between rare
  thermostat kicks a particle coasts along nearly straight, almost
  energy-conserving (Hamiltonian) arcs.

In the ballistic regime a particle travels a distance $L$ in only $O(L)$ steps
instead of $O(L^2)$ — directed motion instead of a random walk. That is a real
speed-up, especially in high dimensions and for elongated, anisotropic targets
where a random walk dawdles.

It is tempting to conclude "so use tiny friction." Not quite: the rate at which a
chain actually decorrelates is **non-monotonic** in $\gamma$ (the Kramers
turnover). Too much friction is the slow diffusive limit; too little and energy
itself decorrelates slowly, so momentum points the same way for a long time
without the thermostat ever reshuffling it. Mixing is fastest somewhere in
between.

## Watch it run

<div class="underdamped-demo" data-widget="underdamped-langevin"></div>

Pull the **friction** slider to the left and the particles glide in long smooth
strokes; push it right and they collapse into the local jitter of Part I. Either
way the cloud fills the same target — momentum changes the texture of the
exploration, not its destination. (Drop the particle count to 1 to watch a single
trajectory's character change.)

## Integrating it without blowing up

One practical note, because it matters in code: integrating a second-order SDE
naïvely is fragile, and large friction makes an explicit Euler step explode. The
demo uses the **BAOAB** splitting (Leimkuhler–Matthews), which alternates small
force kicks (**B**), drifts (**A**) and an *exact* Ornstein–Uhlenbeck update of the
friction-plus-noise part (**O**):

$$
\textbf{B}\,\textbf{A}\,\textbf{O}\,\textbf{A}\,\textbf{B}:\quad
v \mathrel{+}= \tfrac{h}{2}\nabla\log p,\;\;
x \mathrel{+}= \tfrac{h}{2}v,\;\;
v \leftarrow e^{-\gamma h}v + \sqrt{1-e^{-2\gamma h}}\,\xi,\;\;
x \mathrel{+}= \tfrac{h}{2}v,\;\;
v \mathrel{+}= \tfrac{h}{2}\nabla\log p .
$$

Because the **O** step is the *exact* solution of the friction–noise sub-problem,
the scheme stays stable for any $\gamma$ — which is exactly why the friction slider
can sweep across orders of magnitude without the simulation falling apart.

## Where it still falls short

Momentum makes exploration *directed*, but underdamped Langevin still has the two
flaws we already know. It is an **uncorrected discretization**, so a finite step
reintroduces an $O(h)$ bias (just like ULA). And it does **not** abolish
metastability: at the friction that mixes best it crosses barriers a bit more
readily than the overdamped walk, but a high barrier between well-separated modes
is still crossed only rarely.

The natural next move is to stop dribbling momentum in and out through friction,
and instead commit to it: draw a *fresh* velocity, follow a *long* near-Hamiltonian
trajectory, and then add a Metropolis test so those long ballistic moves are exact.
That is Hamiltonian Monte Carlo.

*Next up: Hamiltonian Monte Carlo — making the long ballistic moves count.*
