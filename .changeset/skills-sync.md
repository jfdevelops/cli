---
'@jfdevelops/cli': minor
---

Add `jfdevelops skills` to report whether each enabled skill is current, outdated after a package upgrade, locally modified, or missing its source package, with `--check` exiting 1 when anything needs syncing. Add `jfdevelops skills sync` to update unchanged skill copies to the installed versions, ask before replacing locally edited copies, offer to remove skills whose source package is gone, and record the synchronized versions. The AGENTS.md skill list is now sorted by name.
