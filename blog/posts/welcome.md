Welcome — this is the first post on the blog. I'll use this space for notes,
derivations and half-formed ideas that don't quite fit into a paper: things
about sampling, approximate inference, measure transport and generative
modeling.

This post doubles as a **formatting reference** so you can see what's available
when writing new posts. (To write one, drop a Markdown file in `blog/posts/`
and add an entry to `posts.js` — that's it.)

## Text and links

Standard Markdown works: **bold**, *italics*, `inline code`, and
[links](https://denisbless.github.io). Lists too:

- a first point
- a second point, with a nested item
  - like this
1. ordered
2. lists work as well

> Block quotes are handy for stating a result or an aside before unpacking it.

## Math

Inline math renders with KaTeX, e.g. the overdamped Langevin update
$x_{t+1} = x_t + h\,\nabla \log p(x_t) + \sqrt{2h}\,\xi_t$ with
$\xi_t \sim \mathcal{N}(0, I)$.

Display math gets its own line:

$$
\mathrm{d}X_t = \nabla \log p(X_t)\,\mathrm{d}t + \sqrt{2}\,\mathrm{d}W_t .
$$

And the evidence lower bound, for good measure:

$$
\log p(x) \;\geq\; \mathbb{E}_{q(z)}\!\big[\log p(x \mid z)\big] - \mathrm{KL}\!\big(q(z)\,\|\,p(z)\big) .
$$

## Code

Fenced code blocks are syntax-highlighted:

```python
import torch

def langevin_step(x, score, step_size):
    noise = torch.randn_like(x)
    return x + step_size * score(x) + (2 * step_size) ** 0.5 * noise
```

## Figures

Images are referenced relative to the post — drop them next to the Markdown
file in `blog/posts/`:

```markdown
![A short caption](my-figure.png)
```

That's the whole toolkit. More soon.
