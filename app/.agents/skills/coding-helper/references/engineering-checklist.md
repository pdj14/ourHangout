# Engineering Checklist

Use only the sections relevant to the task.

## Requirements and architecture

- Trace existing callers, state ownership, data flow, and persistence boundaries.
- Define observable success and important empty, null, timeout, failure, and compatibility cases.
- Prefer established repository patterns and narrow interfaces.
- Avoid speculative options, dead code, boolean flag sprawl, and premature generalization.

## Correctness and maintainability

- Keep functions and modules cohesive with meaningful names and explicit public types.
- Use guard clauses and structured errors at boundaries.
- Close files, streams, rows, sockets, timers, listeners, and subscriptions deterministically.
- Make retries bounded, idempotent where necessary, and jittered for shared services.
- Keep configuration precedence explicit and validate required configuration at startup.

## Data and concurrency

- Protect shared mutable state and use a consistent lock order.
- Bound queues and apply backpressure where workloads can grow without limit.
- Wrap related database mutations in transactions.
- Plan compatible, reversible, staged migrations for live systems.
- Store timestamps with an explicit timezone, normally UTC.

## Security and privacy

- Use parameterized queries and context-appropriate output encoding.
- Validate authorization, token expiry, content type, and request size where applicable.
- Keep secrets and sensitive personal data out of source, client responses, and logs.
- Apply rate limits and CSRF, cookie, transport, and browser security controls when required.
- Avoid unsafe regexes, broad filesystem targets, and overly permissive origins or policies.

## Frontend behavior

- Preserve semantic HTML, keyboard access, focus visibility, loading and error states, and responsive layouts.
- Clean up event listeners and async work on unmount.
- Prevent unnecessary rerenders, cumulative layout shift, and unbounded client work.
- Keep API contracts typed and backward compatible.

## Verification

- Reproduce defects with a focused test or deterministic scenario where practical.
- Cover the changed success path and meaningful failure paths.
- Prefer deterministic fixtures over live network or wall-clock dependencies.
- Run race, integration, security, or performance checks when the risk justifies them.
- Never claim a pass without checking the exit status and relevant output.
