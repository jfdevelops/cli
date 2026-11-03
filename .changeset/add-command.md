---
'@jfdevelops/cli': minor
---

Add `jfdevelops add` to extend a configured project. `add --list` shows compatible additions without changing anything. `add skill <name>` enables one skill from an installed package. `add addon <name>` adopts an installed integration, or installs Convex, Portless, or an individual TanStack or jfdevelops library after confirmation, and offers its skills. `add package <name>` scaffolds a TypeScript library in the workspace and registers its directory when needed. Running `add` alone browses the available additions. `skills sync` now asks which version to use when a skill is installed in more than one version.
