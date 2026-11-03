---
'@jfdevelops/cli': patch
---

Run package managers and Git through a shell on Windows so `init`, `create`, and `add addon` can install dependencies and verify projects there; Node refuses to launch the package managers' `.cmd` shims directly.
