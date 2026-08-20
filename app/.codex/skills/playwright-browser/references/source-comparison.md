# Source comparison and conflict resolution

## Contents

1. Integration objective
2. Source map
3. Adopted guidance
4. Adapted guidance
5. Rejected assumptions
6. Conflict rules
7. Update procedure
8. Decision matrix

## 1. Integration objective

AxOneMux uses one managed `playwright-browser` Skill. The goal is to retain the
strongest Playwright practices from several public Skills while avoiding five
simultaneous prompts, duplicated rules, recursive Skill activation, separate
browser processes, and incompatible execution models.

Core rules stay in `SKILL.md` so CLI and API Agents receive them whenever Browser
is enabled. Detailed guidance stays in references and is read only for a relevant
task. This follows progressive disclosure and keeps normal browser requests small.

## 2. Source map

### Currents Playwright Best Practices

- Source: https://github.com/currents-dev/playwright-best-practices-skill
- Strength: broad practical coverage organized by task area.
- Strength: progressive disclosure through reference documents.
- Strength: E2E, component, API, visual, accessibility, CI, and specialized topics.
- Adopted role: broad reliability and specialized-testing catalog.
- AxOne adaptation: all browser ownership remains with AxOneMux.

### TestDino Playwright Skill

- Source: https://github.com/testdino-hq/playwright-skill
- Strength: modular guide packs and explicit golden rules.
- Strength: test architecture, CI, POM, migration, and CLI guidance.
- Strength: semantic locators, no arbitrary waits, and test isolation.
- Adopted role: architecture, fixture, POM, migration, and suite conventions.
- AxOne adaptation: optional architecture advice cannot override an existing suite.

### Microsoft Playwright CLI

- Source: https://github.com/microsoft/playwright-cli
- Strength: bounded command output suitable for coding agents.
- Strength: snapshots and element references for targeted interaction.
- Strength: named sessions, trace capture, screenshots, storage, and network tools.
- Adopted role: evidence budgeting, trace-first diagnostics, and session concepts.
- AxOne adaptation: the CLI runtime is not auto-installed or auto-launched.
- Reason: AxOneMux already owns a per-Agent browser, MCP endpoint, and scripts runtime.

### Lackey Playwright Skill

- Source: https://github.com/lackeyjb/playwright-skill
- Strength: dynamic scripts for multi-step real browser workflows.
- Strength: reusable executor shape and pragmatic progressive disclosure.
- Strength: visible execution and safe temporary cleanup concepts.
- Adopted role: reusable Automation script contract and bounded dynamic flows.
- AxOne adaptation: scripts receive AxOne's page and context instead of launching.

### Qualiow Playwright Skills

- Source: https://github.com/willcoliveira/qualiow-playwright-skills
- Strength: project-aware initialization and suite convention discovery.
- Strength: planning, debugging decision trees, POM, and data guidance.
- Strength: MUST, SHOULD, and WON'T convention framing.
- Adopted role: project-aware suite evolution and failure classification.
- AxOne adaptation: scaffolding is used only when a suite is absent or requested.

### Official Playwright guidance

- Best practices: https://playwright.dev/docs/best-practices
- Locators: https://playwright.dev/docs/locators
- Assertions: https://playwright.dev/docs/test-assertions
- Trace viewer: https://playwright.dev/docs/trace-viewer
- Role: final authority for current Playwright behavior and supported syntax.

## 3. Adopted guidance

- Prefer user-facing locators.
- Avoid CSS and XPath tied to DOM implementation.
- Use locator auto-waiting and web-first assertions.
- Never use arbitrary sleep as the primary synchronization strategy.
- Keep tests isolated and parallel-safe.
- Use fixtures for lifecycle-owned reusable setup.
- Use POM or component objects only when they reduce real complexity.
- Use API setup when UI setup is not under test.
- Use trace and focused evidence for diagnosis.
- Keep browser output bounded for model context efficiency.
- Separate application, test, environment, and transport failures.
- Use project-aware conventions instead of generic scaffolding.
- Use scripts for repeatable operational flows.
- Use Playwright Test for durable regression and CI.
- Cover accessibility and visual behavior intentionally.
- Bound pagination, polling, and multi-user concurrency.

## 4. Adapted guidance

- Microsoft session concepts map to AxOne per-Agent managed Browser ownership.
- CLI snapshots map to bounded MCP snapshots and focused extraction.
- CLI trace concepts map to repository tests or AxOne-supported script evidence.
- Lackey dynamic scripts map to `playwright_scripts/*.cjs|*.mjs`.
- Visible execution maps to the AxOne internal Browser view.
- External temporary script cleanup maps to workspace-owned script maintenance.
- Qualiow initialization maps to inspection of existing config before generation.
- Currents and TestDino modular references map to this Skill's seven reference files.
- Source-specific wording is consolidated into one precedence model.

## 5. Rejected assumptions

- Do not automatically run `npx skills add` for the five source Skills.
- Do not inject all source Skills into every API prompt.
- Do not launch a second Chromium instance.
- Do not use fixed CDP port 9222.
- Do not connect to another Agent's Browser endpoint.
- Do not automatically install or invoke `playwright-cli`.
- Do not use a source executor that owns its own Browser.
- Do not close the AxOne-managed Browser or context.
- Do not force POM onto a simple or established suite.
- Do not overwrite repository conventions with generated boilerplate.
- Do not adopt headed, slow-motion, or timeout defaults globally.
- Do not add arbitrary waits from examples.
- Do not use remote Skills at runtime in restricted enterprise environments.

## 6. Conflict rules

Apply these rules in order:

1. User instructions define the desired outcome.
2. Safety and enterprise policy constrain actions.
3. AxOne runtime ownership rules control Browser lifecycle and endpoints.
4. Official Playwright documentation controls current API behavior.
5. Existing repository conventions control test organization.
6. Domain-specific reference guidance controls the relevant test type.
7. General best practices fill gaps without duplicating domain rules.
8. Source examples are illustrative and never override the above.

When advice conflicts:

- prefer semantic state over elapsed time;
- prefer one managed Browser over independent launch;
- prefer existing config over new scaffolding;
- prefer isolated tests over ordered journeys;
- prefer bounded evidence over whole-page output;
- prefer explicit user confirmation over automated consequential action;
- prefer a clear unsupported result over a silent fallback.

## 7. Update procedure

1. Review upstream release notes or changed source guidance.
2. Identify the distinct contribution, not copied wording.
3. Check official Playwright behavior for version compatibility.
4. Place core invariant changes in `SKILL.md`.
5. Place detailed topic guidance in one owning reference.
6. Remove duplicate guidance from other references.
7. Record source influence in `shared/managedAgentSkills.ts`.
8. Preserve AxOne Browser ownership rules.
9. Preserve Browser ON/OFF conditional activation.
10. Validate the Skill directory.
11. Run managed-Skill and browser tests.
12. Check API prompt size remains bounded.
13. Do not introduce recursive Skill calls.
14. Summarize adopted, adapted, and rejected changes.

## 8. Decision matrix

| Need | Preferred AxOneMux path | Avoid |
| --- | --- | --- |
| One-time page inspection | Playwright MCP | New browser process |
| Repeated operational flow | Browser Automation script | Ad-hoc copy/paste every run |
| Regression suite | Existing `@playwright/test` | Automation history as CI |
| Locator repair | Snapshot plus semantic locator | Long CSS/XPath |
| Flake diagnosis | Focused evidence then trace | Raising sleeps first |
| Project scaffolding | Inspect, then minimal generation | Overwriting conventions |
| API Agent Browser task | Conditionally injected core Skill | All references every prompt |
| CLI Agent deep task | Read relevant reference | Load all references |
| Browser connection error | Restart managed runtime | Launch external Chrome |
| Website 401/403 | Review authentication/access | Report MCP failure |
| Large result | Structured bounded data/artifact | Full DOM in chat |

No additional user choice is required for this integration. A separate Microsoft
Playwright CLI runtime can be considered later as an independent optional tool,
but it must not be coupled to the Browser toggle or replace AxOne's managed MCP.
