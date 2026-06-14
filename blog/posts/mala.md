In [Part I](post.html?slug=overdamped-langevin) we built the Unadjusted Langevin
Algorithm (ULA),

$$
x_{k+1} = x_k + h\,\nabla \log p(x_k) + \sqrt{2h}\;\xi_k ,
\qquad \xi_k \sim \mathcal N(0, I),
$$

and saw its first flaw: the finite step $h$ makes it **biased**. ULA is a
discretization of a continuous process, and the discretization error means its
stationary distribution is not $p$ but something $O(h)$ away from it — in
practice slightly over-dispersed. Shrinking $h$ shrinks the bias, but also grinds
exploration to a halt. This post fixes the bias *exactly*, at any step size, with
one cheap extra ingredient.

## Turning a step into a proposal

The trick is to stop trusting the ULA step and instead treat it as a *suggestion*
that we are free to reject. This is the **Metropolis–Hastings (MH)** recipe: from
the current point $x$, draw a candidate $y$ from some proposal $q(\,\cdot \mid x)$,
then accept it with a probability chosen so that the chain leaves the target $p$
invariant.

Take the proposal to be exactly one Langevin step:

$$
q(y \mid x) = \mathcal N\!\big(y;\; x + h\,\nabla\log p(x),\; 2h\,I\big),
$$

i.e. $y = x + h\,\nabla\log p(x) + \sqrt{2h}\,\xi$. We then accept $y$ with
probability

$$
\alpha(x, y) = \min\!\left(1,\;
\frac{p(y)\,q(x \mid y)}{p(x)\,q(y \mid x)}\right).
$$

If accepted, $x_{k+1} = y$; otherwise we **stay**, $x_{k+1} = x$. That is the
**Metropolis-Adjusted Langevin Algorithm (MALA)** — ULA plus an accept/reject
gate. Equivalently: *ULA is just MALA with the gate held permanently open.*

Two details make it cheap, and they are the same two that made ULA practical:

- **The normalizer cancels.** $p(y)/p(x) = \tilde p(y)/\tilde p(x)$, so we never
  need $Z$.
- **The proposal is asymmetric, and that matters.** $q(y\mid x)$ is centred at
  $x + h\nabla\log p(x)$, but the reverse move $q(x\mid y)$ is centred at
  $y + h\nabla\log p(y)$. The ratio $q(x\mid y)/q(y\mid x)$ corrects for this — it
  is what separates MALA from a blind random-walk Metropolis, and it only needs
  the score at $x$ and $y$ (and the score at $y$ becomes the next step's drift, so
  a step costs about one gradient and one density evaluation).

## Why the gate removes the bias

The acceptance rule is engineered to enforce **detailed balance** with respect to
$p$:

$$
p(x)\,T(x \to y) = p(y)\,T(y \to x),
$$

where $T$ is the full MALA kernel (propose $\times$ accept). Summing over $x$ shows
that $p$ is left invariant by $T$ — and this holds for **any** step size $h$, with
no discretization error left over. Where ULA over-shoots and over-disperses, MALA
spots the proposals that are "too aggressive" — their acceptance ratio dips below
one — and rejects just enough of them to pin the stationary distribution back onto
$p$ exactly. The discretization error is absorbed into the rejections.

## Watch it run

<div class="mala-demo" data-widget="mala"></div>

Start in **ULA** and push the **step size** up: the particles get jumpy, scatter
past the modes and pile up against the walls — that is the bias (and, further up,
outright instability) made visible. Now switch to **MALA** at the same large step.
The over-eager proposals start getting **rejected** (the red flashes), the
acceptance rate drops, and the cloud snaps back onto the target. Dial the step
down and acceptance climbs back toward 100% — but the moves get tiny. Somewhere in
between is the sweet spot.

## What MALA fixes — and what it doesn't

MALA buys you two real things:

- **No more discretization bias.** The chain targets $p$ exactly, at *any* $h$.
- **Bigger usable steps.** Because instability is auto-rejected, MALA stays valid
  at step sizes that would make ULA diverge, which often means faster mixing than
  the tiny-$h$ ULA you would otherwise be forced into.

The price is a knob to tune — the **acceptance rate**. Too large a step and almost
everything is rejected (the chain freezes); too small and the accepted moves are
microscopic. In high dimension the sweet spot sits near an acceptance rate of
$0.574$, with an optimal step that shrinks like $h \sim d^{-1/3}$ — gentler than
random-walk Metropolis's $d^{-1}$, but still a reminder that dimension is never
free.

And here is the catch the demo makes obvious if you set up two well-separated
modes and watch a single particle: **MALA does not fix slow mixing between
modes.** It is still a *local* proposal. A jump aimed across a low-density valley
lands where $p(y)$ is tiny, so it is almost always rejected — sometimes MALA hops
between modes *less* often than plain ULA, which at least diffuses across now and
then. The exponential-in-the-barrier metastability from Part I is untouched.

Removing bias was the easy win, but MALA still *crawls*: it is a local random walk
that forgets its direction every step. The next idea is to give the sampler
**momentum** — let it build up velocity and travel in straight lines instead of
diffusing — so it covers ground far faster.

*Next up: underdamped Langevin dynamics — sampling with momentum.*
