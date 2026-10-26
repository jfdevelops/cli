---
name: jf-git-workflow
description: Organize Git history when initializing a project, starting a distinct section or idea, or moving between workstreams. Read before choosing or switching branches and before planning commits.
---

# Git workflow

Inspect the repository root, current branch, existing history, staged diff, and worktree before acting. Establish whether this is a new project or an existing repository. Preserve the user's work and existing history.

## Initialize on main

For a new project with no commits, initialize the baseline on `main`. Keep this baseline limited to the project foundation: package metadata, required skills, configuration, documentation, and checks. Verify it and make one initialization commit named `chore(init): initialize project` when initialization commits are authorized.

Do not recreate an initialization commit, rename an established default branch, or rewrite history when adopting an existing project. If initialization or committing is disabled for a generated project, report that the initial commit remains pending.

## Branch by section or idea

After the initialization commit, move to a descriptive topic branch before beginning a distinct section or idea. Keep `main` as the baseline and integration branch, rather than the place for ongoing feature work.

Use one branch per coherent workstream, not one branch per file or commit. Reuse the current branch while working on the same idea. Start a separate branch when the work moves to an independent idea; if it depends on unfinished work, make that dependency explicit instead of mixing unrelated changes.

Follow the target repository's branch prefix policy. If it specifies none, use `codex/<short-kebab-case-topic>`, such as `codex/skill-discovery` or `codex/cli-foundation`. Branch names should describe the work, not the agent or session identifier.

Create or switch branches within the user's authorized workflow. A standing instruction to branch when beginning a section authorizes that transition for the current task; the skill alone does not grant permission. If switching would disturb unrelated uncommitted work, preserve it and resolve the workspace choice before switching. Do not automatically stash, discard, or move someone else's changes.

## Keep commits cohesive

Read the project's commit-conventions skill before staging or committing. Each commit should represent one reviewable change and include its directly related tests and documentation. Separate shared-skill changes, adoption of those skills in a consumer, and unrelated feature implementation when those are distinct changes.

Verify the staged diff and relevant checks before each commit. Finish with the active branch, commit outcomes, and remaining work clearly reported. Pushing, merging, publishing, and history rewrites require their own authorization; branch organization does not imply those actions.
