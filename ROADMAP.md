# Project roadmap

This document records the product direction and implementation plan agreed so far. Completed items describe the local repository foundations; planned commands and configuration examples are not implemented interfaces yet.

## Goal

Start a new project or adopt an existing one through `npx @jfdevelops/cli`, choose its setup and skills, and begin building with consistent conventions. Keep optional integrations optional, let libraries own their API-specific skills, and support ongoing discovery and additions after initial setup.

The CLI is both a project setup tool and a discovery channel. It should remain useful throughout a project's life rather than only generating its first files.

## Package ownership

| Repository / npm package | Responsibility |
| --- | --- |
| `jfdevelops/cli` / `@jfdevelops/cli` | Command parsing, interactive flows, project detection, catalogs, configuration, scaffolding, skill discovery, installation, and synchronization |
| `jfdevelops/skills` / `@jfdevelops/skills` | Shared conventions and their supporting resources, independently versioned and released |
| Individual libraries | Skills describing their own APIs and workflows, bundled in their published packages |

Shared skills are maintained centrally but installed as versioned project-local files. Collaborators and agents should not depend on a developer's global configuration. Updating the shared package must not silently change every consuming project.

The CLI uses Commander for commands, arguments, flags, nested subcommands, help, and usage errors. Clack supplies interactive text input, selections, multiselects, confirmations, and progress output. Keep terminal input/output separate from discovery, planning, configuration, and file operations so the same behavior can be tested and eventually invoked without interactive prompts.

## Command surface

All examples below follow `npx @jfdevelops/cli <command>`. The originally proposed `npx @jfdevelops --create` cannot identify a scoped npm package; `@jfdevelops/cli` is the selected package name.

| Command | Intended behavior |
| --- | --- |
| `create` | Launch the interactive new-project flow |
| `init` | Adopt an existing project without replacing its structure or instructions |
| `add` | Browse compatible additions interactively |
| `add --list` | List additions available for the current project |
| `add skill <name>` | Enable a specific available skill |
| `add addon <name>` | Add or adopt an optional integration and offer its associated skills |
| `add package <name>` | Scaffold another package in a library workspace |
| `create skills` | Scaffold or register skills owned by a library package |
| `skills` | Show discovered, enabled, outdated, and missing-source skills |
| `skills sync` | Reconcile enabled skills with installed source-package versions |
| `help` | Show command help; also support conventional `--help` usage |

Commander must distinguish plain `create` from its `skills` subcommand. Commands should report invalid arguments and incompatible additions before changing files. Cancellation must leave a clear outcome rather than implying that setup completed.

## New-project flow

1. Ask for the project name and destination.
2. Ask whether the project is an app or library.
3. Ask the relevant follow-up questions for that choice: framework or bindings, workspace shape, backend, deployment, publishing, and formatter as applicable. The exact initial template catalog remains to be specified.
4. Offer compatible optional integrations and their skills.
5. Select the shared and discovered skills to install, clearly identifying required conventions and optional skills.
6. Preview the files, configuration, dependencies, and Git actions before applying them.
7. Generate the project, retain the CLI as a development dependency for later discovery and additions, and record resolved choices in `jfdevelops.json`.
8. For a new Git project, produce the verified initialization commit on `main` when Git initialization is selected and authorized. Report any skipped or incomplete step accurately.

Reuse the same setup engine as `init` rather than maintaining a separate skill installer for generated projects.

## Existing-project adoption

`init` should detect package manager, workspaces, app/library targets, installed integrations, current configuration, and existing agent instructions. A monorepo may contain both apps and libraries, so the root project type alone is insufficient.

Present detected integrations as suggestions for confirmation, not automatic consent to install their skills or replace their configuration. Offer an adopt-existing path: a project already using Convex should be able to enable its skills without scaffolding Convex again.

Show a reviewable change plan before applying changes. Preserve existing project structure, custom configuration, agent instructions, and unrelated dependencies. Add a managed pointer section to existing agent instruction files instead of overwriting them. Detect name/path collisions and explain the resolution needed.

Adoption must be repeatable without duplicate instructions or registrations. Preserve existing Git history and default branch; do not invent a fresh initialization commit in an established repository.

## Addons and target compatibility

The following integrations are opt-in:

- Portless.
- Convex.
- Individual TanStack libraries.
- Individual `@jfdevelops` libraries.
- Formatter selection, with the shared code-style policy preserved across supported choices.

Install addon-specific skills only when the corresponding addon is selected. Selecting one TanStack or jfdevelops package does not opt the project into the whole family. A dependency detected during adoption should be offered for confirmation rather than automatically enabling its skills.

Portless-backed development and preview commands are generated when Portless is selected. The current repository's agent instructions still require Portless for any local app that is run here.

`add --list` should reflect target compatibility: for example, `add package` is for library-workspace package scaffolding. It should generate the new package's manifest, source entry point, compiler/build setup, applicable tests and skills, and workspace registration rather than just creating an empty directory. Exact package-template contents depend on the selected library mode.

## Shared conventions and formatting

The three currently packaged shared skills are:

- `jf-naming-conventions`.
- `jf-coding-conventions`.
- `jf-git`, containing the master Git skill and branch, commit, and PR references in one folder.

All three are required in this CLI repository. The shared coding style follows the Code styling section of `jfdevelops/glammed-by-arielie/AGENTS.md`: declared top-level functions, arrow callbacks except React component callbacks, grouped declarations, braces for control flow, blank lines before returns and around functions/code blocks, and `cn` for conditional classes. App-specific rules apply only to compatible targets; app direct-import conventions do not prohibit deliberate library entry points.

Formatting needs both agent guidance and executable enforcement. Plan a `jf-formatting-conventions` skill in the shared package, moving spacing guidance into one authoritative place rather than duplicating it across skills. This skill has been discussed but is not created yet.

Let users choose a supported formatter while keeping mandatory statement-spacing behavior consistent. The proposed enforcement approach is a small ESLint Stylistic policy alongside the selected formatter, with `format` and `format:check` scripts covering both. Formatter choices and compatibility tests remain to be implemented.

The import rule requires separation after the final import. Consecutive imports may remain together; the discussed `blankLine: 'any'` exception permits existing gaps, whereas `'never'` would forbid them. Settle that distinction before finalizing the policy. Translate return/function/block spacing into precise executable rules and test representative code, comments, and repeated formatting passes. Do not claim a formatter combination enforces a rule until verified.

## Git lifecycle

For newly initialized projects, `main` contains one foundation commit: `chore(init): initialize project`. Start a descriptive topic branch when work moves into a distinct section or idea. Reuse that branch for the same workstream rather than making one branch per file or commit.

Keep each commit cohesive, including its directly related tests and documentation. Use `type(scope): summary`, with lowercase outcome-focused subjects and no attribution/session trailers. Every topic branch must use exactly one change-type prefix: `feat/`, `fix/`, `refactor/`, `docs/`, `style/`, `test/`, `chore/`, `ci/`, or `perf/`, followed by a short kebab-case topic. Other prefixes require explicit user instruction; tool and agent defaults do not override this rule. Keep `main` as the unprefixed initialization and integration branch.

All Git guidance is grouped in `jf-git/`. Its master skill requires inspecting the current repository's branch, commit, and PR conventions before making decisions; task-specific references supply shared defaults only where those conventions are silent. Current explicit user instructions take precedence. Preserve dirty worktrees and existing history. Branch organization does not itself authorize pushes, merges, publishing, or history rewrites.

## Package-owned skill discovery

Participating packages declare skills in their published `package.json`:

```json
{
  "jfdevelops": {
    "skills": [
      {
        "name": "build-react-layouts",
        "path": "./skills/build-react-layouts"
      }
    ]
  }
}
```

This is a jfdevelops metadata convention. Each path identifies a bundled directory containing `SKILL.md`, stays inside the package, and agrees with the skill's directory/frontmatter name. The shared skills repository already supplies a JSON Schema for the metadata object.

Discover from installed package versions so instructions match the available API. Do not copy library-owned instructions into the CLI's permanent shared catalog. A catalog may map existing libraries that publish skills without discovery metadata until those libraries adopt it.

During `create`, `init`, and `add`, show source package/version and let the user select compatible skills. Newly discovered skills remain opt-in. `skills sync` should detect upgraded source packages, removed dependencies, missing skills, and edited installed copies. Explicit synchronization may update unchanged managed files; present conflicts before replacing locally edited content.

Resolve ambiguous names across source packages explicitly rather than silently choosing one. Discovery must not execute a package's skill instructions or scripts merely to list them.

## Authoring package-owned skills

`create skills` should select the owning library package in a workspace, detect existing `SKILL.md` files, and either register them or scaffold a new skill with name and description prompts. Preserve existing skill content when registering it.

Add the selected registrations to `jfdevelops.skills` and ensure their folders are included in the npm publication. Preview manifest changes and new files. Validate frontmatter, matching names, unique registrations, in-package paths, and actual package contents. Repeat runs should avoid duplicate entries.

Proposed direct options are `create skills --package <package-name>` and `create skills --path <skill-directory>`. These are planned conveniences, not implemented flags. Scaffolding metadata is separate from writing useful skill instructions, and neither action publishes the library.

## Project configuration and managed files

`jfdevelops.json` records the resolved setup and later additions. Evolve the current skills-only file into a versioned configuration covering:

- Schema version and generator identity/version.
- Project identity, package manager, and app/library/workspace targets.
- Selected addons, formatter, and resolved options per target.
- Enabled skills, whether required, source package/version/path, and content hashes.
- Scaffolded workspace packages and their selected templates.
- Managed file ownership and the baseline content needed to detect local edits.

Use structured choices rather than storing a raw shell command as the authoritative setup. Record resolved versions and provenance so the project can explain how it was created. Package manifests remain authoritative for dependencies; this file tracks CLI-managed selections. It must contain no secrets or copied client environment values.

Update configuration only after the corresponding operation succeeds. Define schema migration behavior before incompatible changes. A future hosted schema URL must not be advertised as working until published.

| File state | Intended update behavior |
| --- | --- |
| CLI-managed and unchanged | Update during an explicit applicable operation |
| CLI-managed and locally edited | Present the diff and require a merge decision |
| Existing project-owned file | Preserve it and propose a targeted edit |

The current bootstrap sync script regenerates owned files in these two new repositories. It is not the existing-project installer and must not be reused as though it safely merges arbitrary user files.

## Agent portability

Use standard `SKILL.md` metadata and agent-neutral instructions. Maintain canonical content once, then generate native discovery adapters or copies as needed. Keep mandatory skills explicitly linked from project instructions; automatic discovery alone does not guarantee required rules are read.

Current project setup supplies `.agents/skills`, `.claude/skills`, `.cursor/skills`, `.github/skills`, and instruction pointers through `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor rules, and Copilot instructions. Other agents can consume the same Markdown through the project index/instructions.

Validate content parity and test actual discovery in the supported agent versions before claiming automatic support. An agent still needs file access and must load the instructions; identical behavior across every agent cannot be guaranteed by packaging alone.

## Delivery milestones

### 0. Repository foundations — complete locally

- [x] Initialize both repositories with a foundation commit on `main`.
- [x] Prepare the independently versioned shared skills package and discovery metadata schema.
- [x] Add naming, coding, and unified Git skills.
- [x] Install required skill copies, agent instructions, and provenance in the CLI.
- [x] Add metadata/path validation, skill tests, package-content checks, and CI configuration.
- [x] Install Commander and Clack and verify dependency imports/parsing.

Both packages are unpublished. The CLI is private and has no command executable yet. The CLI currently consumes checked-in snapshots from the local skills repository; after the first shared-skills release, pin that package as a development dependency and synchronize from the installed version. Configured CI still needs a remote run after authorized pushes.

### 1. Shared engine — next

- [x] Define the target-aware project configuration schema and validation.
- [x] Detect project/package-manager/workspace state.
- [ ] Discover package-owned skills and construct the compatible catalog.
- [ ] Build reviewable change plans with managed-file ownership and conflicts.
- [ ] Apply selected changes with accurate success/failure tracking.

Completion: representative new and existing project fixtures produce correct discovery and change plans, preserve unrelated content, and support repeat runs without duplicate changes.

### 2. Existing-project `init`

- [ ] Add the command entry point, Commander routing/help, and Clack prompt boundary.
- [ ] Confirm detected targets/integrations and select skills.
- [ ] Preview and apply setup, instruction pointers, CLI dependency, and configuration.
- [ ] Cover cancellation, conflicts, partial failures, and unchanged repeat runs.

Completion: initialize an existing project, select skills, review the changes, and install them without disturbing its files or Git history. This is the first usable product milestone.

### 3. New-project `create`

- [ ] Define initial app and library templates and their follow-up questions.
- [ ] Reuse the setup engine for chosen addons and skills.
- [ ] Establish formatter-independent style enforcement.
- [ ] Generate and verify the new project's foundation and initial Git commit.

Completion: both app and library flows generate a usable project with only selected integrations, correct skills, recorded choices, and passing applicable checks.

### 4. Ongoing additions and discovery

- [ ] Implement `add`, `add --list`, and skill/addon/package additions.
- [ ] Implement `skills` status and explicit `skills sync`.
- [ ] Handle package upgrades, missing sources, name conflicts, target compatibility, and edited skill copies.

Completion: extend an initialized project and reconcile its enabled skills without overwriting local edits or enabling unselected integrations.

### 5. Library authoring support

- [ ] Implement `create skills` for single packages and workspaces.
- [ ] Register existing skills or scaffold new ones with publication validation.
- [ ] Add discovery metadata to participating jfdevelops libraries in separately authorized changes.

Completion: a library tarball exposes its declared skills, and the CLI discovers those exact files from an installed consumer dependency.

### 6. Release readiness

- [ ] Test command behavior, real packed executables, and supported operating systems/Node versions.
- [ ] Verify interactive cancellation and non-interactive behavior where supported.
- [ ] Smoke-test agent discovery adapters and formatter combinations.
- [ ] Document onboarding, conflicts, configuration evolution, and skill updates.
- [ ] Publish the shared skills and CLI packages through separately authorized releases.

## Decisions still open

- Initial app/library templates and exact follow-up choices.
- Which formatters ship first, and whether gaps inside import groups are allowed.
- Final configuration structure, schema hosting, and migration strategy.
- Target scoping of native agent discovery when a monorepo mixes integrations.
- Catalog mappings for libraries without metadata and ambiguous skill-name selection.
- Exact non-interactive flags and behavior for scripted usage.
- Recovery strategy for interrupted operations and edited managed files.
- Release automation and versioning policy for instruction changes.

Resolve these within their milestones rather than treating illustrative command options or configuration sketches as finalized contracts.
