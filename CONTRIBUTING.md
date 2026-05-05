# Contributing

Thanks for your interest in contributing. This repository is a portfolio
case study, but the workflow below mirrors how I would maintain it as a
production system.

## Table of Contents

- [Development Setup](#development-setup)
- [Branching Model](#branching-model)
- [Commit Conventions](#commit-conventions)
- [Pull Requests](#pull-requests)
- [Code Style](#code-style)
- [SQL Conventions](#sql-conventions)
- [Reporting Issues](#reporting-issues)

## Development Setup

```bash
git clone https://github.com/linneamoritznyc/bigquery-lead-scoring-sem.git
cd bigquery-lead-scoring-sem/scripts
npm install
npm run typecheck
npm test
```

Node 20+ is required. The TypeScript pipeline runs in dry-run mode by
default and uses the bundled mock fixtures, so no GCP credentials are
needed for local development.

## Branching Model

- `main` is the protected default branch. It is always deployable.
- Feature work happens on `feat/<short-slug>` branches.
- Hotfixes use `fix/<short-slug>`.
- Documentation-only changes use `docs/<short-slug>`.

Rebase onto `main` before opening a pull request. Avoid merge commits
inside feature branches.

## Commit Conventions

This repository follows [Conventional Commits](https://www.conventionalcommits.org/).
Allowed types:

| Type     | When to use                                          |
| -------- | ---------------------------------------------------- |
| `feat`   | A new user-facing capability                          |
| `fix`    | A bug fix                                             |
| `docs`   | Documentation-only changes                            |
| `chore`  | Build config, tooling, dependency bumps               |
| `test`   | Adding or refining tests                              |
| `refactor` | Code change that neither fixes a bug nor adds a feature |

Keep the subject line under 72 characters. Imperative mood, no trailing
period.

## Pull Requests

1. Open the PR against `main`.
2. Fill in the description: problem statement, approach, validation steps.
3. Link the relevant issue if one exists.
4. CI must be green before review.
5. Squash-merge once approved.

## Code Style

- TypeScript with `strict: true`. No `any` without an inline justification comment.
- Prettier formats on save; ESLint enforces style.
- Public functions get JSDoc only when the signature is non-obvious.
- Tests live next to the module under `scripts/tests/`.

## SQL Conventions

- Every file opens with a header block: purpose, input dataset, output shape, assumptions.
- Use lower-snake-case for column aliases and CTE names.
- Capitalize keywords (`SELECT`, `FROM`, `WHERE`).
- One column per line in long projections.
- Prefer CTEs over subqueries for anything beyond a single join.
- Window functions are explicit about partitioning and ordering.

## Reporting Issues

Open a GitHub issue with:

- Expected behavior
- Actual behavior
- Repro steps (or a query plan / log snippet)
- Environment: Node version, BigQuery region, dataset suffix

Security-sensitive reports should go to the email listed in the README,
not the public tracker.
