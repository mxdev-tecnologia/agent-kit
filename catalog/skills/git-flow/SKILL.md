---
format: agent-kit/v1
name: git-flow
description: Branch and pull request conventions for delivering work without direct pushes to protected branches. Use when creating branches, committing or opening a pull request.
---

# Git flow

Delivery happens through pull requests. The repository owner merges.

## Branches

- An integration branch receives finished work; a release branch holds published versions. Names are set by the project.
- Work branches: `feature/spec-NN-slug` for a spec, `epic/<slug>` for a group of specs, `release/X.Y.Z` and `hotfix/X.Y.Z` for releases.
- Start from the integration branch unless the human names another base.

## Rules

- Never push directly to the integration or release branches. Never force-push or rewrite published history.
- Never merge a pull request yourself; the owner does it after review.
- Update a branch by merging the base into it, not by rebasing a published branch.
- Stage explicit files. Check the staged diff stat before every commit.
- Commit format follows the `commit-format` rule. Keep commits small and focused.
- A pull request references its spec, lists the criteria with evidence, and notes any manual check still pending.

## Procedure

1. Create the work branch from the base.
2. Commit in small steps, running the gate before the last commit.
3. Push the branch and open the pull request against the base.
4. After the merge, sync the specs and the status.

Related skills: `verification-evidence`, `project-memory`.
