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
   ============================================================ */

window.POSTS = [
  {
    slug: 'welcome',
    title: 'Welcome to the blog',
    date: '2026-06-14',
    summary:
      'What this space is for — and a quick tour of the formatting you get out of the box: math, code, figures and callouts.',
    tags: ['meta'],
  },
];
