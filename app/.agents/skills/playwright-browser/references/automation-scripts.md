# AxOne Browser Automation scripts

## Contents

1. Choosing the execution mode
2. Script contract
3. Script construction
4. Result contract
5. Safety and lifecycle
6. Review and maintenance
7. Example skeletons
8. Checklist

## 1. Choosing the execution mode

Use live MCP interaction when:

- the task is exploratory;
- the correct locator is not known;
- the page state must be inspected between actions;
- the user wants one-time navigation or evidence;
- failure diagnosis needs interactive snapshots.

Use Browser > Scripts when:

- the same flow will be run again;
- the flow has stable arguments and a structured result;
- a user wants a named script and run history;
- the managed internal Browser session must be reused;
- a bounded extraction or operational helper is needed.

Use repository `@playwright/test` when:

- the result is regression coverage;
- CI execution is required;
- fixtures, projects, retries, and reports are needed;
- the repository already owns a test suite;
- assertions must gate delivery.

Do not install a separate Playwright CLI or executor just because a source Skill
uses one. AxOneMux already owns the internal Browser and script runtime.

## 2. Script contract

- Store scripts in `<workspace>/playwright_scripts`.
- Use `.cjs` or `.mjs`.
- Keep base names unique across both extensions.
- Export exactly one asynchronous entry function.
- Accept the AxOne-provided runtime object.
- Use the supplied `page` and `context`.
- Use the supplied `browser` only for supported inspection.
- Treat `endpoint` as diagnostic metadata, not a connection target.
- Treat `args` as untrusted input.
- For a newly created script, default `REPORTS_DIR` to `<script-directory>/results/<script-base-name>_YYYYMMDD_HHmmss_SSS/`. Prefer the AxOneMux-supplied `outputDir`, which already has that run-specific layout.
- Preserve an existing script's deliberately specified output folder unless the user asks to migrate it. The Browser Script runner executes that script contract as written.
- Compute a standalone fallback timestamp once at module initialization and reuse one constant directory throughout the run. Never derive a new result directory while writing individual artifacts.
- Treat `process.cwd()` as the Agent Workspace when the script is run through Browser > Scripts or the Agent automation tools.
- Keep reusable source and data paths Workspace-relative. Resolve them with Node's `path.resolve(process.cwd(), relativePath)`; use `path.join` instead of hard-coded slash or backslash concatenation.
- Never embed a Windows drive path, Linux home path, user profile, Desktop, Downloads, temporary directory, AxOneMux installation path, or another Agent's Workspace.
- Accept a caller-supplied absolute input only as an explicit per-run value, validate its scope, and never save it as the script's default.
- Validate required arguments at the top.
- Give validation errors actionable messages.
- Do not call `chromium.launch`.
- Do not call `connectOverCDP`.
- Do not create an MCP client.
- Do not read `AXONE_PLAYWRIGHT_MCP_URL` from Automation scripts.
- Do not close the supplied browser or context.
- Close only pages explicitly created by the script when appropriate.
- Keep loops and pagination bounded.
- Respect the run timeout and stop action.

## 3. Script construction

- Begin with a short purpose comment.
- State required and optional arguments.
- Normalize strings without destroying meaningful whitespace.
- Navigate only when the current page is unsuitable.
- Prefer semantic locators.
- Use stable test IDs when semantics cannot distinguish controls.
- Avoid generated CSS and XPath.
- Use state-based waits.
- Start popup, download, and response waits before actions.
- Separate read-only collection from mutations.
- Ask the user before creating scripts with consequential mutations.
- Make read operations idempotent.
- Make write operations detect duplicate execution where possible.
- Return partial scope only when the result states the limitation.
- Track page or cursor keys during pagination.
- Stop on duplicate keys to avoid infinite loops.
- Cap rows, pages, and retained text.
- Capture a focused screenshot only when it adds evidence.
- Save screenshots, reports, downloads, and other artifacts under `outputDir` so concurrent and historical runs never mix.
- Do not create a new reusable script with a fixed untimestamped default such as `results/mosaic_ibs_open_issues`.
- Do not emit sensitive values through `console.log`.
- Use `console.log` only for concise diagnostics.
- Throw errors with stage and safe cause.
- Preserve the original cause when wrapping an error.
- Do not catch and report success after a failed required action.

## 4. Result contract

- Return a non-empty JSON-serializable value.
- Prefer an object with `status`, `summary`, and domain fields.
- Include inspected scope for paginated collection.
- Include counts and stable identifiers when useful.
- Include `warnings` for partial or uncertain results.
- Include artifact paths only for files actually created.
- Do not return `Page`, `Locator`, `Response`, or other runtime objects.
- Do not return circular objects.
- Do not return unbounded HTML or full DOM content.
- Do not include cookies, tokens, or authorization headers.
- Use ISO timestamps when time is material.
- Keep user-facing text in the user's language where practical.
- Preserve exact safe error messages separately from summary.
- Do not rely on console output as the saved result.

Suggested shape:

```js
return {
  status: 'completed',
  summary: 'Collected 12 matching rows from 3 pages.',
  inspected: { pages: 3, rows: 42 },
  matches,
  warnings: [],
}
```

## 5. Safety and lifecycle

- Reuse the Agent's managed browser ownership.
- Do not scan local ports.
- Do not connect to another Agent's endpoint.
- Do not restart the Browser from script code.
- Report runtime connection failure to the caller.
- Distinguish target-site 401/403 from runtime connection failure.
- Let AxOneMux handle a target-site HTTP 401: it preserves the Agent Browser session, waits 2.5 seconds, and retries the same run once for both UI- and Agent-started scripts. Do not add a second retry loop in the script or Agent workflow.
- Do not silently switch to Chrome or Edge.
- Do not persist credentials in script source.
- Avoid external network destinations outside the requested task.
- Keep file writes inside the workspace.
- Do not execute downloaded files.
- Avoid destructive cleanup outside script-owned artifacts.
- Honor user cancellation.
- Ensure loops observe cancellation through awaited Playwright operations.
- Do not retry consequential clicks automatically.
- Make cleanup best-effort without hiding the primary failure.

## 6. Review and maintenance

- Run the script from Browser > Scripts.
- Confirm the selected Agent owns the expected Browser.
- Review the input arguments before running.
- Observe the Browser for the first consequential flow.
- Inspect structured result and run history.
- Keep failed-run reasons specific.
- Update locators when product semantics change.
- Prefer improving accessibility over increasingly brittle selectors.
- Move stable regression expectations to repository tests.
- Remove one-off scripts that no longer provide value.
- Keep script names verb-oriented and domain-specific.
- Add a short description near the entry function.
- Avoid copying entire generated scripts between workspaces blindly.
- Review authentication assumptions after environment changes.
- Review bounds when dataset size grows.

## 7. Example skeletons

CommonJS:

```js
const path = require('node:path')

module.exports = async ({ page, args, outputDir }) => {
  const url = String(args?.url || '')
  if (!url) throw new Error('url is required')
  await page.goto(url)
  const heading = await page.getByRole('heading').first().textContent()
  const screenshot = path.join(outputDir, 'page.png')
  await page.screenshot({ path: screenshot })
  return { status: 'completed', heading: heading?.trim() || null, screenshot }
}
```

ES module:

```js
export default async ({ page, args, outputDir }) => {
  const limit = Math.min(100, Math.max(1, Number(args?.limit || 20)))
  const rows = await page.getByRole('row').evaluateAll(
    (nodes, max) => nodes.slice(0, max).map((node) => node.textContent?.trim()),
    limit,
  )
  return { status: 'completed', count: rows.length, rows }
}
```

## 8. Checklist

- [ ] Correct execution mode was chosen.
- [ ] Script uses supplied page and context.
- [ ] Both `.cjs` and `.mjs` contracts remain supported.
- [ ] Base name is unique.
- [ ] Arguments are validated.
- [ ] Locators are semantic and stable.
- [ ] Waits are state-based.
- [ ] Loops and output are bounded.
- [ ] Consequential actions are authorized.
- [ ] Result is compact and serializable.
- [ ] Generated files are written under `outputDir`.
- [ ] Reusable inputs are Workspace-relative or supplied explicitly at runtime.
- [ ] No PC-specific absolute path, user directory, or hard-coded path separator is embedded.
- [ ] No managed runtime object is closed.
- [ ] No fixed port or external browser is used.
