# Exploration and locator guide

## Contents

1. Exploration loop
2. Evidence budget
3. Locator priority
4. Locator construction
5. Frames, tabs, and dynamic UI
6. Forms and actions
7. Review checklist

## 1. Exploration loop

1. State the page or user journey being inspected.
2. Confirm that AxOne Browser is enabled for this Agent.
3. Use the existing managed page; never launch a second browser.
4. Navigate only when the current page is not already useful.
5. Capture a bounded accessibility snapshot before choosing a locator.
6. Identify the smallest relevant region, dialog, form, or list.
7. Prefer an element's user-visible role and accessible name.
8. Perform one meaningful action at a time during diagnosis.
9. Capture a new snapshot after navigation or a major UI mutation.
10. Reuse stable references only while the page state remains compatible.
11. Re-resolve a locator after route changes or full re-renders.
12. Record only evidence needed to answer the request.
13. Stop exploring once the requested fact or failure is established.
14. Convert a repeated flow into an Automation script when reuse is likely.
15. Convert product regression coverage into repository tests, not ad-hoc scripts.

## 2. Evidence budget

- Start with URL, title, and the relevant snapshot subtree.
- Request a screenshot only when spatial or visual evidence matters.
- Crop or focus screenshots when the whole viewport adds no value.
- Extract table rows as structured fields instead of copying page text.
- Limit list collection by count, page, date, or explicit stop condition.
- Summarize repeated rows instead of returning identical markup.
- Keep console messages to errors and relevant warnings.
- Keep network evidence to the failed or asserted request.
- Use a trace only after snapshots and focused logs are insufficient.
- Do not include cookies, authorization headers, or secret form values.
- Redact account identifiers unless they are required by the task.
- Prefer counts and selected examples over complete private datasets.
- When pagination exists, report inspected pages and remaining scope.
- When an iframe is involved, name the frame and target element.
- When the page was never reached, do not report a site-level failure.

## 3. Locator priority

Use this order unless the application gives a stronger contract:

1. `getByRole(role, { name })` for interactive and landmark elements.
2. `getByLabel(text)` for form controls with accessible labels.
3. `getByPlaceholder(text)` when placeholder is the actual product contract.
4. `getByText(text)` for stable visible copy and read-only content.
5. `getByAltText(text)` for meaningful images.
6. `getByTitle(text)` when title is intentionally stable.
7. `getByTestId(id)` for an explicit test contract.
8. A short CSS locator scoped under a semantic parent.
9. XPath only for an unavoidable legacy structure, with a reason.

Do not prefer:

- generated class names;
- nth-child chains;
- deeply nested CSS selectors;
- layout coordinates;
- text fragments that change with locale;
- internal framework attributes;
- selectors copied blindly from browser developer tools;
- an index when a unique semantic property exists.

## 4. Locator construction

- Scope from a stable container before selecting a repeated child.
- Name dialogs before locating buttons inside them.
- Use exact accessible names when nearby controls are ambiguous.
- Use regular expressions only when copy legitimately varies.
- Avoid broad regex patterns that match unrelated elements.
- Filter repeated rows by stable row text, then locate the row action.
- Prefer `locator.filter({ hasText })` over selecting the nth row.
- Prefer `has` or `hasText` over manual DOM traversal.
- Use `first()` only when first is a documented user-facing rule.
- Use `nth()` only when ordering itself is the tested behavior.
- Assert uniqueness when a locator should identify one element.
- Treat strict-mode violations as a locator design problem.
- Do not disable strictness to hide ambiguous selection.
- Keep selectors close to the behavior they express.
- Extract a helper only when the selector is reused or conceptually named.
- Keep page-object locators private when callers need only behaviors.
- Expose component objects for reusable widgets, not every DOM node.
- Prefer locator composition to raw `page.$` element handles.
- Do not retain element handles across navigation or re-render.
- Use locator assertions so Playwright can retry safely.

## 5. Frames, tabs, and dynamic UI

- Use `frameLocator` for iframe content.
- Select a frame by stable URL or accessible owner when possible.
- Do not assume the first iframe is the target.
- Wait for a popup with `page.waitForEvent('popup')` before triggering it.
- Pair the event promise and click with `Promise.all` when appropriate.
- Name and track each tab or page explicitly.
- Close only pages created by the script, never the managed Browser context.
- For virtualized lists, scroll the container incrementally.
- Re-query visible rows after each virtualized scroll.
- Stop when a stable terminal row or duplicate page key is observed.
- For infinite scroll, define a maximum item or iteration bound.
- For shadow DOM, prefer locators that pierce open shadows naturally.
- Document closed-shadow limitations instead of injecting unsafe workarounds.
- For canvas, validate surrounding accessible output before using coordinates.
- If coordinates are unavoidable, anchor them to measured element bounds.
- For animations, wait on final UI state rather than animation duration.
- For overlays, assert that the overlay disappeared or target became actionable.
- For hydration, assert the user-visible ready state before interaction.
- For stale snapshots, obtain a new snapshot instead of guessing a ref.

## 6. Forms and actions

- Use `fill` for ordinary text replacement.
- Use keyboard typing only when key-by-key behavior is under test.
- Use `selectOption` for native selects.
- Use role-based interaction for custom comboboxes.
- Assert the selected value after changing it.
- Use `check` and `uncheck` for checkboxes and radios.
- Upload only files explicitly in scope.
- Confirm the accepted file name or preview after upload.
- Never submit, purchase, delete, message, or publish without user authority.
- Separate form population from consequential submission.
- Capture a pre-submit summary when confirmation is required.
- Wait for the response or resulting UI state before claiming success.
- Distinguish client validation from server rejection.
- Preserve exact safe validation text in error reports.
- Do not retry a non-idempotent submission automatically.
- Use an idempotency key when the application contract supports one.
- Avoid copying secrets into logs or returned results.
- Clear test credentials from reusable script arguments and examples.
- Restore modified settings when the task promises non-destructive inspection.
- Leave the managed page in a comprehensible state when practical.

## 7. Review checklist

- [ ] The AxOne-managed browser is reused.
- [ ] No fixed port or external browser was introduced.
- [ ] A current snapshot informed the locator.
- [ ] Semantic locators were preferred.
- [ ] The locator is unique or intentionally scoped.
- [ ] No arbitrary sleep is used for synchronization.
- [ ] Navigation and popup events cannot race the action.
- [ ] Collection loops have explicit bounds.
- [ ] Consequential actions have authority.
- [ ] Returned evidence is compact and redacted.
- [ ] A connection failure is separated from a website response.
- [ ] The target page reachability is stated accurately.
- [ ] Repeated logic is routed to Automation or tests appropriately.
- [ ] Managed browser, context, and shared sessions are not closed.
- [ ] The final response states what was observed, not what was guessed.
