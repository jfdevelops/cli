---
'@jfdevelops/cli': minor
---

Workspace packages now have stub sources in `src/` and stub tests in `test/`, and build, type check, and test through cached Vite+ tasks. New workspaces also get a CI workflow that runs these tasks only in the packages a change affects and the packages that depend on them, reusing cached results between runs.
