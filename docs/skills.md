# Skills, updates, and conflicts

## Where skills come from

Skills come from packages installed in your project. A package publishes skills by listing them in the `jfdevelops.skills` field of its `package.json` (see [authoring skills](authoring.md)). The CLI reads that metadata and each `SKILL.md` from the installed version, so instructions always match the API you have installed. It never runs anything from those packages to discover skills.

The three shared conventions come from `@jfdevelops/skills`, which the CLI itself depends on, and are always installed.

In a workspace, each package only sees skills from its own dependencies plus those of the project root. Skills from an integration package (Convex, Portless, TanStack, or jfdevelops libraries) are offered only after that integration is adopted with `init` or `add addon`.

## Checking status

```sh
jfdevelops skills
```

| State | Meaning | What sync does |
| --- | --- | --- |
| `current` | Copies match the installed version | Nothing |
| `outdated` | The installed version changed, or copies are missing or out of date | Updates the copies |
| `modified` | At least one copy was edited after the CLI wrote it | Asks whether to keep or replace each edited copy |
| `missing-source` | The package is no longer installed | Offers to remove the skill |
| `ambiguous` | Several versions are installed in the workspace | Asks which version to use |

Add `--check` in CI to fail when the project needs a sync.

## Updating after an upgrade

```sh
jfdevelops skills sync
```

Sync updates every unchanged copy to the installed version, refreshes the `AGENTS.md` skill list, and records the new versions in `jfdevelops.json`. Removed skills are deleted only after you choose them; a skill whose removal you decline keeps its files and stays listed as not installed.

## How the CLI tells your edits from its own files

`jfdevelops.json` records the SHA-256 of every file the CLI wrote. Before changing a file, the CLI compares it on disk with that record:

- If it is unchanged, the CLI may update or delete it.
- If it differs, it is yours now: the CLI shows a diff and asks.
- If a file was edited after the plan was shown but before it was applied, that file is skipped and reported as failed instead of being overwritten.

## Conflicts

| Conflict | Why it happens | Choices |
| --- | --- | --- |
| Edited after the CLI last wrote it | You or a tool changed a managed copy | Keep the file, or replace it with the planned content |
| Exists and is not managed by the CLI | A file the CLI wants to create is already there | Keep the file, or replace it |
| No longer needed but edited | A removed skill's copy was edited | Keep the file, or delete it |
| Managed for something outside this setup | Another skill or addon owns the path | Kept; resolve the ownership first |
| A directory or link, not a file | Something other than a file is at the path | Kept; the CLI never writes through links |

Kept conflicts stay recorded under their previous state, so the next `skills` run reports them again until they are resolved. Run the command again to retry files that failed.

## Instruction files

The CLI only edits text between `<!-- jfdevelops:start -->` and `<!-- jfdevelops:end -->`. Everything else in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` is yours and preserved, including line endings. A file with only one of the two markers stops the command until it is fixed. Generated projects keep Prettier and Biome away from skill copies, `jfdevelops.json`, and lockfiles, which the CLI and package managers rewrite.
