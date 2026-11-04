---
'@jfdevelops/cli': minor
---

Let `jfdevelops create` add packages while it sets up a project. App monorepos and library projects ask "Do you want to add a package?", name each library in a loop that shows where it will be created, and repeat until you are done. Agreeing in a library project creates a workspace of publishable libraries; libraries added to an app monorepo are private. Invalid and duplicate names are asked for again, and every package is recorded as a target in `jfdevelops.json`.
