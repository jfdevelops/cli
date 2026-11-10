---
'@jfdevelops/cli': patch
---

Refuse `create` when the destination already has `jfdevelops.json`, and format only the files create wrote or overwrote so kept conflicts stay untouched.

Skip unsupported file types during scaffold formatting and verification so ignore files do not cause project creation to fail.
