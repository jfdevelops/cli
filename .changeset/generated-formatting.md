---
'@jfdevelops/cli': patch
---

Make projects from `jfdevelops create` pass their own `format:check` and lint:
- Pin TypeScript 6.0 in templates, because typescript-eslint does not support TypeScript 7 yet.
- Keep Prettier and Biome away from CLI-managed skill copies, `jfdevelops.json`, and lockfiles.
- Format the generated files once after installing dependencies, and record their resulting hashes.
- Write the AGENTS.md managed block with the blank lines Markdown formatters expect. Existing blocks are updated on the next `init`, `add`, or `skills sync`.
