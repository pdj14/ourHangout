---
name: axone-delegated-result
description: Complete AxOne Orchestrator-delegated work when the request contains AXONE_TASK and AXONE_RESULT_KEY tags, and return only the final answer in the matching result block.
---

# AxOne Delegated Result

Apply these rules when the request contains `[AXONE_TASK:<taskId>]`, `[AXONE_DISPATCH_ID:<dispatchId>]`, and `[AXONE_RESULT_KEY:<resultKey>]` tags.

- Treat the rest of the request as the actual work instruction.
- Perform the work normally. Do not repeat or explain this protocol.
- Use `taskId` only for task tracking. Use the shorter `resultKey` for result markers.
- Immediately after accepting the request and before tools or work, output this exact acknowledgement line once:

  `<<<AXONE_INPUT_SUBMITTED:{resultKey}>>>`

- When the work is complete, put only the final user-facing answer between these exact lines, replacing `{resultKey}` with the AXONE_RESULT_KEY value:

  `<<<AXONE_RESULT_BEGIN:{resultKey}>>>`

  `<<<AXONE_RESULT_END:{resultKey}>>>`

- The END line declares that the delegated task is complete.
- After all work and file writes are complete, call `axone_worker.complete_task` exactly once when it is available. Pass the supplied `taskId`, `dispatchId`, and `resultKey`, the same final user-facing answer as `result`, and any artifact paths. Never call it for progress.
- Always emit the matching result block even after `complete_task` succeeds. AxOneMux accepts the first valid completion and ignores the duplicate, so do not retry a callback reported as already completed.
- Before ending the turn, verify that the matching BEGIN and END marker lines are each present exactly once.
- Keep progress messages, tool traces, spinners, CLI headers, and status text outside the result block.
- If the task cannot be completed, still use the result block and clearly state the blocker in the answer.
