# Our Hangout Quality Upgrade Tracker

## Rule
- Keep this file as the single source of truth for UX quality progress.
- Mark completed items with `[x]` only after device verification.
- Add a short date note for each completed item.

## Backlog (Priority Order)
- [x] Brand system and design tokens (color, type, spacing, radius, motion) - 2026-03-01 (foundation in `App.tsx`)
- [x] Core journey polish (`join -> add friend -> first message`) - 2026-03-01 (device QA end-to-end)
- [ ] Component state coverage (`default/pressed/loading/disabled/error/success`) - in progress
- [x] Empty / Loading / Error / Offline screens - 2026-03-01 (QA state switch on device)
- [x] Chat reliability UX (sending/failed/retry/read states) - 2026-03-01 (device QA with fail/retry/read)
- [ ] Media UX (upload progress/cancel/retry/size guidance)
- [x] Safety UX (link block/report/block quick actions) - 2026-03-01 (device QA with block/report/unblock)
- [ ] Accessibility baseline (contrast, large text, touch target, labels)
- [ ] Localization hardening (all strings externalized + date/time locale)
- [ ] Performance pass (list perf, image cache, startup responsiveness)
- [ ] Motion consistency pass
- [ ] Settings UX (notification/privacy/data saver)
- [ ] Analytics events and funnel checkpoints
- [ ] QA matrix (low-end device + bad network scenarios)

## Current Sprint
- [x] Tracker file created (2026-03-01)
- [x] 1st implementation pass completed (2026-03-01)
- [x] Design tokens foundation
- [x] Empty/Loading/Error/Offline states
- [x] Device verification (`quality-pass1.png`, `view-quality-pass1.xml`)
- [x] 2nd implementation pass: chat reliability UX (`view-quality-pass2-fail.xml`, `view-quality-pass2-retry-final.xml`)
- [x] 3rd implementation pass: safety UX (`quality-pass3-safety.png`, `view-quality-pass3-safety-blocked.xml`, `view-quality-pass3-safety-report.xml`, `view-quality-pass3-safety-unblocked.xml`)
- [x] 4th implementation pass: core journey polish (`quality-pass4-core-journey.png`, `view-quality-pass4-journey-a.xml`, `view-quality-pass4-journey-b.xml`, `view-quality-pass4-journey-c.xml`, `view-quality-pass4-journey-d.xml`)
- [x] 5th implementation pass: UX surface separation (`quality-pass5-ux-separation.png`, `onboarding` separate stage, `safety actions` sheet, `QA` hidden by default) - 2026-03-01
- [ ] Next implementation pass: media UX (upload progress/cancel/retry/size guidance)

## Notes
- Device for validation: `R3CT80AGZWK`
