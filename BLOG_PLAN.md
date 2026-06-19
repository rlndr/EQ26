# Blog Feature Plan ✓ Complete (2026-06-19)

Add a markdown-based blog to land3r.net, sourced from Obsidian markdown files. Content lives in the repo; no CMS or separate build system.

## Approach

Stay within the existing Vite + React + TypeScript stack. No new frameworks.

## Dependencies to add

```bash
npm install gray-matter marked
```

- **gray-matter** — parses YAML frontmatter from `.md` files
- **marked** — renders markdown body to HTML

## New files and folders

```
src/
├── content/
│   └── blog/
│       └── *.md          # Drop Obsidian exports here
├── lib/
│   └── blog.ts           # Glob import, frontmatter parsing, slug generation
├── pages/
│   ├── BlogPage.tsx      # Post index — list of all posts
│   └── BlogPostPage.tsx  # Individual post renderer
```

## Routes to add in App.tsx

```tsx
<Route path="blog">
  <Route index element={<BlogPage />} />
  <Route path=":slug" element={<BlogPostPage />} />
</Route>
```

## Nav link to add in Layout.tsx

```tsx
<NavLink to="/blog">Blog</NavLink>
```

## Frontmatter convention for Obsidian files

Each `.md` file should include:

```yaml
---
title: Post Title
date: 2026-06-14
description: One-line summary shown on the index page.
---
```

## Notes

- Obsidian standard markdown renders fine with `marked`
- Wikilinks (`[[]]`) will be ignored — strip them before publishing if needed
- `import.meta.glob` in `src/lib/blog.ts` auto-discovers all files in `src/content/blog/` at build time — no manual registration needed
- Posts are static; adding a post = dropping a `.md` file and rebuilding
