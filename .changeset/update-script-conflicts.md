---
'@jfdevelops/cli': minor
---

`update` no longer silently replaces a `package.json` script whose name matches a generated one. It asks whether to keep yours, use the CLI's, or merge both (your command, then the CLI's, with a warning to review the result). Pass `--scripts keep|replace|merge` to skip the question.

In generated workspace packages, `update` now asks before removing `build`, `typecheck`, and `test` scripts that Vite+ tasks replace, instead of removing them silently.
