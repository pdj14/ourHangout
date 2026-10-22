---
name: axone-workspace-output
description: Keep explicitly requested or necessarily persistent AxOne file outputs inside the current Agent workspace and report their absolute paths for UI or A2A delivery. Use only when the user asks to create, save, export, or download a file/deliverable, supplies a filename or path, or the task cannot be completed without persistent filesystem output. Do not use for ordinary text answers, analysis, review, explanation, summary, comparison, recommendation, or report-style chat responses.
---

# AxOne Workspace Output

- Return text in chat by default. Do not create a file for ordinary analysis, review, explanation, summary, comparison, recommendation, or report-style responses.
- Treat file intent as explicit only when the user asks to create, save, export, or download a file/deliverable, supplies a filename, extension, or path, or completing the task necessarily requires persistent filesystem output.
- Do not create files merely because the request arrived through an API/A2A route or because file tools are available.
- A delegated result that would exceed the AxOne result transport budget is a necessary persistent output: save the full detail as a Markdown report under `axone_reports/`, then return a concise summary and its artifact path.
- Never choose Markdown or a `.md` file by default except for the delegated-result overflow fallback above. Preserve the user's requested filename and format; ask when an unspecified format materially affects the result.
- Create requested files inside the current Agent workspace by default.
- Do not write outside the workspace unless the user explicitly requests a different location.
- In the final response, list every newly created deliverable under this exact heading:

  `AxOne artifacts:`

- Put one absolute file path on each following `- ` line.
- List only existing files, not directories or planned paths.
- Do not add the heading when no file was created.
