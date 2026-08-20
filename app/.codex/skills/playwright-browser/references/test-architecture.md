# Test architecture, fixtures, and data

## Contents

1. Scope and test shape
2. Isolation
3. Fixtures
4. Authentication and state
5. Page and component objects
6. Data design
7. Assertions
8. Suite evolution
9. Review checklist

## 1. Scope and test shape

- Test user-observable behavior rather than implementation details.
- Give each test one primary behavior and a clear failure story.
- Include precondition, action, and observable outcome.
- Keep setup necessary to understand the behavior near the test.
- Move mechanical setup to named fixtures when it obscures intent.
- Prefer several focused tests over one long journey when failures isolate better.
- Keep a small smoke journey for the most valuable end-to-end path.
- Do not duplicate lower-level coverage in every browser test.
- Use API setup when UI setup is not itself under test.
- Use UI setup when the setup flow is part of the requirement.
- Keep test titles phrased in domain language.
- Avoid titles such as `works` or `test 1`.
- Tag tests by business capability or execution need, not author name.
- Keep test files near the project's established test location.
- Preserve the repository's current runner, config, and module format.
- Do not scaffold a new suite when a compatible suite already exists.
- Inspect package scripts and Playwright config before changing architecture.
- Match the installed Playwright version and TypeScript settings.

## 2. Isolation

- A test must not require another test to run first.
- A test must not depend on ordering within a worker.
- Give each test unique mutable records.
- Remove or expire created records when cleanup is safe and required.
- Avoid sharing a mutable page between independent tests.
- Use a fresh BrowserContext through Playwright Test defaults.
- Share immutable setup data only when it cannot be modified.
- Do not rely on wall-clock dates without controlling the clock or range.
- Avoid production-like global accounts that parallel tests can corrupt.
- Namespace test data by worker, run, or generated identifier.
- Make retry behavior safe; retries must not duplicate irreversible actions.
- Prefer deterministic server fixtures to UI-reset scripts.
- When isolation is impossible, serialize only the smallest affected group.
- Document the shared resource and why serialization is necessary.
- Do not make the full suite serial to hide data collisions.
- Ensure local and CI concurrency use the same isolation assumptions.
- Treat flakiness as a defect, not a reason to raise retries indefinitely.
- Use retries to collect evidence, not to declare an unstable test healthy.

## 3. Fixtures

- Extend the test runner with typed fixtures for reusable capabilities.
- Keep fixture names domain-oriented.
- Separate worker-scoped expensive resources from test-scoped mutable state.
- Use automatic fixtures sparingly; invisible setup increases debugging cost.
- Declare dependencies between fixtures explicitly.
- Dispose fixture resources in `finally` or fixture teardown.
- Keep fixture timeouts proportional to the resource they create.
- Return a ready-to-use object, not a partially initialized promise chain.
- Avoid fixtures that silently swallow setup failures.
- Attach useful setup diagnostics to the test result.
- Never attach secrets or full authorization payloads.
- Keep network mocking fixtures distinct from real-backend fixtures.
- Make environment requirements visible in config or tags.
- Provide safe defaults for local execution.
- Fail clearly when required credentials or services are absent.
- Do not skip silently because setup failed.
- Reuse storage state through a deliberate auth fixture.
- Regenerate state when invalid rather than layering login retries.
- Keep fixture implementation smaller than the behaviors it enables.
- Prefer functions for one-off setup and fixtures for lifecycle ownership.

## 4. Authentication and state

- Store authenticated state outside source control.
- Never commit cookies, tokens, or personal session data.
- Use a dedicated test account where policy allows.
- Validate that saved state still reaches an authenticated page.
- Refresh expired state through a controlled setup project.
- Keep roles separate when authorization behavior differs.
- Name storage files by role, not by a person's identity.
- Do not reuse the AxOne interactive Browser profile as a CI credential artifact.
- Do not export a managed Agent's browser storage without explicit authority.
- Prefer API authentication setup when officially supported.
- Exercise UI login in a small dedicated set of tests.
- Preserve multi-factor and enterprise policy boundaries.
- Report interactive login requirements instead of bypassing them.
- Clear state after logout tests.
- Assert both the visible logged-out state and protected-route behavior.
- Keep session-expiration tests isolated from ordinary flows.

## 5. Page and component objects

- Introduce a page object when a page exposes reusable domain actions.
- Introduce a component object for a reusable dialog, table, or navigation unit.
- Keep assertions in tests unless the object expresses a domain invariant.
- Use action methods such as `createProject`, not click-by-click wrappers.
- Keep locators inside the owning object.
- Pass `Page` or a scoped `Locator` into the constructor.
- Do not make one global object own the whole application.
- Avoid inheritance hierarchies for pages.
- Prefer small composition of components.
- Do not expose every locator as public state.
- Return meaningful data from query methods.
- Do not hide consequential actions behind ambiguous names.
- Make navigation expectations explicit.
- Avoid caching locators or element handles that can become stale.
- Keep object methods deterministic and bounded.
- Do not add a POM merely to increase abstraction.
- Preserve direct locators in short, readable tests.
- Refactor only after repetition or complexity demonstrates value.

## 6. Data design

- Use builders for valid domain objects with explicit overrides.
- Keep factories deterministic unless randomness is part of the test.
- Seed random generators when random coverage is needed.
- Include a run identifier in generated unique fields.
- Use boundary values intentionally.
- Separate valid, invalid, and malicious-input datasets.
- Avoid huge parameter matrices in browser tests.
- Move pure combinations to unit or API tests.
- Keep localized copy outside selectors when multiple locales run.
- Use stable IDs returned by setup APIs.
- Validate setup responses before navigating to the UI.
- Delete only data created by the current test.
- Do not clean a shared environment with broad wildcard deletion.
- Record enough identifiers to diagnose leaked test data.
- Keep personal or production data out of fixtures.
- Redact imported examples.

## 7. Assertions

- Use web-first `expect(locator)` assertions for UI state.
- Prefer `toBeVisible`, `toBeEnabled`, and `toHaveText` over manual polling.
- Use `toHaveURL` and `toHaveTitle` for navigation outcomes.
- Use `toHaveValue` for form state.
- Use `toHaveCount` for bounded collection assertions.
- Assert the meaningful result, not every intermediate animation.
- Use soft assertions only when collecting several independent diagnostics.
- Do not use soft assertions for prerequisites.
- Include a message when the business reason is not obvious.
- Avoid exact full-page text assertions for dynamic pages.
- Normalize only variability that the requirement permits.
- Use `expect.poll` for non-DOM values that become observable over time.
- Use `expect.toPass` for a bounded multi-step condition, not arbitrary retries.
- Keep polling intervals and timeout explicit for slow external state.
- Fail with evidence that identifies expected and actual behavior.
- Avoid assertion loops that hide which item failed.
- Use screenshot assertions only for visually meaningful contracts.
- Mask dynamic regions instead of raising pixel tolerance broadly.

## 8. Suite evolution

- Read current conventions before generating files.
- Keep MUST rules few, objective, and enforceable.
- Keep SHOULD rules adaptable to context.
- Document intentionally unsupported patterns as WON'T rules.
- Migrate one coherent area at a time.
- Do not mix broad architecture migration with a small bug fix.
- Preserve test names when history and reporting depend on them.
- Replace deprecated APIs according to installed-version documentation.
- Run the smallest affected test first.
- Run a representative suite before broad migration completion.
- Update CI commands only after local command parity is proven.
- Keep generated boilerplate smaller than the product behavior tests.
- Remove obsolete helpers after all callers migrate.
- Do not keep two competing fixture or POM systems indefinitely.
- Explain deviations from repository conventions in the change summary.

## 9. Review checklist

- [ ] Tests express user-visible outcomes.
- [ ] Tests are independently runnable.
- [ ] Mutable data is unique per test or worker.
- [ ] Authentication data is protected.
- [ ] Fixtures have clear scope and cleanup.
- [ ] POM or components reduce real complexity.
- [ ] Existing repository conventions are preserved.
- [ ] Assertions use retryable Playwright semantics.
- [ ] No arbitrary sleep hides readiness problems.
- [ ] Parallel and retry behavior are safe.
- [ ] The smallest relevant tests were executed.
- [ ] CI behavior matches local assumptions.
