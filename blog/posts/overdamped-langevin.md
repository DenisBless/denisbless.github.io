A huge number of problems in machine learning and the sciences come down to a
single deceptively simple task: **draw samples from a distribution you can only
evaluate up to a constant.** You have a target

$$
p(x) = \frac{1}{Z}\,\tilde p(x), \qquad Z = \int \tilde p(x)\,\mathrm{d}x ,
$$

where the *unnormalized* density $\tilde p(x)$ is cheap to evaluate but the
normalizing constant $Z$ is a high-dimensional integral you cannot compute.
Bayesian posteriors ($\tilde p = \text{likelihood} \times \text{prior}$),
Boltzmann distributions $\tilde p(x) = e^{-U(x)}$ from statistical physics, and
energy-based models all have this form.

This series builds up the modern toolkit for this problem from scratch. We start
with the workhorse that almost everything else refines: **overdamped Langevin
dynamics.**

## The idea

Instead of attacking the integral, we build a *stochastic process* whose
equilibrium distribution is exactly $p$, and then simulate it. Run it long
enough and its state is a sample from $p$.

Write the target as an energy, $U(x) = -\log \tilde p(x)$, so that
$p(x) \propto e^{-U(x)}$. The overdamped Langevin stochastic differential
equation (SDE) is

$$
\mathrm{d}X_t = -\nabla U(X_t)\,\mathrm{d}t + \sqrt{2}\,\mathrm{d}W_t
            = \nabla \log p(X_t)\,\mathrm{d}t + \sqrt{2}\,\mathrm{d}W_t ,
$$

where $W_t$ is Brownian motion. Read it as a tug-of-war: the **drift**
$\nabla \log p$ pulls each particle uphill toward high-probability regions, while
the **noise** $\sqrt{2}\,\mathrm{d}W_t$ keeps kicking it around so it never just
collapses onto a mode. The balance between the two is what reproduces the right
spread.

Crucially, the drift uses $\nabla \log p = \nabla \log \tilde p$ — the unknown
constant $Z$ disappears under the gradient. That is what makes the whole approach
practical.

## Why it samples $p$

Why should this particular balance of drift and noise give *exactly* $p$? Track
the probability density $\rho_t$ of the random state $X_t$. It evolves according
to the **Fokker–Planck equation**

$$
\partial_t \rho_t = \nabla\!\cdot\!\big(\rho_t \,\nabla U\big) + \Delta \rho_t
                  = \nabla\!\cdot\!\big(\rho_t \nabla U + \nabla \rho_t\big) .
$$

A stationary distribution $\rho_\star$ is one that no longer changes,
$\partial_t \rho_\star = 0$. It is enough for the term in parentheses — the
probability flux — to vanish:

$$
\rho_\star \nabla U + \nabla \rho_\star = 0
\;\;\Longleftrightarrow\;\;
\nabla \log \rho_\star = -\nabla U
\;\;\Longrightarrow\;\;
\rho_\star(x) \propto e^{-U(x)} = p(x) .
$$

So $p$ is a stationary distribution of the dynamics. Under mild conditions (for
instance a confining energy $U$), it is the *unique* one, and $\rho_t \to p$ as
$t \to \infty$ from essentially any start: the process forgets where it began and
relaxes to the target. Equivalently, Langevin dynamics is the gradient flow of
$\mathrm{KL}(\rho_t \,\|\, p)$ in Wasserstein geometry, so this "distance to the
target" decreases monotonically along the way.

## From SDE to algorithm

We cannot integrate the SDE exactly, so we discretize it with an Euler–Maruyama
step of size $h$. Replacing $\mathrm{d}W_t$ by a Gaussian increment
$\sqrt{h}\,\xi_k$ gives the **Unadjusted Langevin Algorithm (ULA):**

$$
x_{k+1} = x_k + h\,\nabla \log p(x_k) + \sqrt{2h}\;\xi_k ,
\qquad \xi_k \sim \mathcal{N}(0, I) .
$$

Every step is one gradient ascent on the log-density plus a precisely calibrated
dose of Gaussian noise. That is the entire algorithm — and it is exactly the
update running in the demo below.

## Watch it run

<div class="langevin-demo" data-widget="overdamped-langevin"></div>

The target is a mixture of three Gaussians. Each dot is a particle taking ULA
steps. With many particles their cloud settles into the shading — the dynamics
really do reproduce the target density. Now drag the slider down to a **single
particle**: it jitters around inside one mode for a long time and only rarely
makes the trip across a low-density valley to another. That picture is the key to
understanding where this method breaks down.

## Where it struggles

Overdamped Langevin is simple, general, and only needs the score
$\nabla \log p$ — but plain ULA has real limitations, and essentially every later
method in this series exists to fix one of them.

- **Discretization bias.** ULA does not sample $p$ exactly. The finite step $h$
  means the chain's stationary distribution is $p$ only up to an $O(h)$ error, so
  it is slightly *over-dispersed*. Shrinking $h$ reduces the bias but slows
  everything down. A Metropolis accept/reject step (**MALA**) removes the bias
  entirely.
- **Slow mixing between modes.** Crossing a low-probability barrier between
  well-separated modes needs a rare, sustained run of noise kicks in the same
  direction; the expected crossing time grows *exponentially* in the barrier
  height (metastability). A single chain can sit trapped for a very long time —
  exactly what you see at one particle — and consecutive samples are highly
  correlated.
- **The step-size dilemma.** Too large an $h$ and the discretization becomes
  unstable or badly biased; too small and exploration crawls. There is no
  universally good choice.
- **Stiffness / ill-conditioning.** When the target has very different length
  scales in different directions, $h$ must be small enough for the *tightest*
  direction, making progress along the loose directions painfully slow.
- **The curse of dimensionality.** Mixing time and the number of steps needed for
  an effectively independent sample generally grow with the dimension.

These are not bugs in the implementation; they are intrinsic to the vanilla
method. The rest of the series is about beating them: a Metropolis correction to
kill the bias (MALA), **tempering and annealing** to cross barriers, **momentum**
(underdamped Langevin) to explore faster, and finally **learned samplers** that
transport an easy distribution onto $p$ in finitely many steps.

*Next up: fixing the discretization bias exactly with a Metropolis correction — MALA.*
