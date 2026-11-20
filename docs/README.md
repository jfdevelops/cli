# Documentation

Public pages live in `framework/node/v0/`, matching the CLI's package major.
Start with [the overview](framework/node/v0/overview.md).

Follow the `jf-docs` skill in the shared skills library. Pages have `title`,
`description`, and `order` frontmatter. Navigation comes from page order.

```sh
pnpm docs:generate
pnpm docs:check
```

The generator writes `docs.json` and `meta.json`; these files are ignored.
`pnpm check` also generates and validates these files, and CI checks the same
workflow on Linux and Windows with Node.js 22 and 24. The docs site runs the
generator after fetching its pinned repository commit; generated metadata does
not need to be committed.
Generation skips the TypeDoc reference because this package exposes an executable,
not a public TypeScript import API. The hand-written command reference documents
its public interface. No formatter or Markdown linter is configured in this repository;
the docs checker validates Markdown, layout, links, anchors, and installation examples.

When the package major changes, add its version directory and preserve these pages
for readers using earlier releases. Update repository links when moving pages.
