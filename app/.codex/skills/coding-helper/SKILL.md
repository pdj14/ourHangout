---
name: coding-helper
description: Apply a verification-first, context-efficient software engineering workflow that combines evidence-based planning, root-cause debugging, smallest-adequate implementation, testing, and concise reporting. Use for implementing, debugging, refactoring, reviewing, testing, or planning code changes, and when updating engineering Skills so new guidance is attributed, deduplicated, assigned clear ownership and precedence, and prevented from creating recursive or conflicting tool or Skill loops.
---

# Coding Helper

Combine the process discipline of Superpowers, the high-signal communication style of Smart Caveman, and Ponytail's smallest-adequate-solution bias. Adapt the depth of the workflow to the task instead of forcing ceremony onto small changes.

## Composition and ownership

- Referenced approaches: Superpowers (workflow discipline), Smart Caveman (concise evidence), and Ponytail (minimal solution ladder).
- Apply this Skill once per task. Do not reload it, recursively call it, or repeat an analysis because another Skill contains similar engineering guidance.
- User and workspace instructions define the outcome. Safety, result correlation, and data integrity override brevity or minimality.
- A domain Skill owns its domain. For example, Design Helper owns visual decisions; this Skill owns implementation quality and verification.
- Prefer, in order: an existing capability, a local change, a small shared helper, and only then a new abstraction or dependency. Stop at the first option that fully satisfies correctness and verification.

## Work from evidence

1. Inspect relevant repository instructions, code paths, tests, and current behavior before editing.
2. State only assumptions that materially affect the result. Ask a question only when a safe, in-scope assumption would risk the outcome.
3. Identify the actual failure mechanism or desired behavior before choosing an implementation.
4. Keep the change scoped to the request and preserve unrelated user work.

## Keep context economical

- Search for symbols and callers before reading files; read the smallest useful ranges and batch related lookups.
- Reuse unchanged evidence already collected in the current task. Do not rescan the repository or reread the same large file without a concrete reason.
- Prefer structured Task, diff, test, and bounded activity data over full terminal scrollback or entire conversation history.
- Stop gathering context when the root cause and affected boundary are supported well enough to implement and verify safely.
- Do not add summarization, compression, caching, or memory loops unless measured context pressure justifies them.

## Plan proportionally

- For a small, local edit, keep the plan implicit or brief.
- For multi-file or risky work, define behavior, affected boundaries, verification, and rollback concerns before editing.
- Prefer the smallest coherent design that fits existing project conventions. Avoid speculative abstractions and duplicated logic.

## Implement with engineering discipline

- Add or update tests when behavior changes and a practical test surface exists.
- Use red-green-refactor when reproducing a defect or introducing testable logic; do not manufacture a failing test when the repository has no suitable harness.
- Validate external input and public boundaries. Preserve API and data compatibility unless a breaking change is explicitly required.
- Fix root causes instead of suppressing errors, weakening assertions, or returning misleading fallbacks.
- Check concurrency, resource lifetime, security, performance, accessibility, and failure handling when relevant.

Read [engineering-checklist.md](references/engineering-checklist.md) when the task is complex, touches a public boundary, fixes a production defect, or warrants a deeper review.

## Verify before claiming completion

1. Run the narrowest relevant checks first.
2. Run broader typechecks, tests, lint, build, or runtime checks in proportion to risk.
3. Inspect failures instead of treating a command invocation as proof.
4. Report checks that actually ran, their result, and anything that could not be verified.

When this Skill's bundled `scripts/select-tests.mjs` is available, it may be used to recommend repository checks from the changed-file set. Run it at most once per stable changed-file set and verification phase. It recommends commands but never executes them; do not call it in a retry loop.

## Evolve this Skill safely

- Treat the managed Skill registry and manifest as the provenance source. Record each adopted approach and its distinct contribution there instead of copying overlapping Skill bodies.
- Before adding guidance from another Skill, classify it as domain-specific, workflow-wide, or already covered. Let a domain Skill own domain behavior; merge only the non-duplicated workflow contribution here.
- Update the canonical bundled Skill first. Workspace copies are generated snapshots and must not become independent policy forks.
- Keep precedence and conflict rules explicit. Never make one Skill recursively invoke another, and never introduce repeated tool, memory, summarization, or verification loops.
- Measure a recurring gap before adding a script, dependency, cache, index, or MCP. Prefer revising an existing rule or bounded helper when it solves the same problem.
- When behavior or triggering changes, update the frontmatter description, UI metadata, capability description, provenance manifest, and focused tests together.

## Communicate at high signal

- Lead with the outcome.
- Preserve root cause, important trade-offs, breaking changes, exact verification evidence, and useful file references.
- Remove greetings, filler, repeated narration, and large unchanged code blocks.
- Keep progress compact without compressing away context the developer needs.

When Design Helper is also enabled, let Design Helper govern visual and interaction decisions while this skill governs implementation quality, testing, and verification.
