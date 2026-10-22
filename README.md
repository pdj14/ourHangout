# Our Hangout

The current React Native / Expo application lives in `app/`.

```powershell
cd app
npm.cmd run check
npm.cmd start
```

## Development guidance

- `app/.agents/skills/coding-helper/`: implementation and verification guidance.
- `app/.agents/skills/design-helper/`: interface and accessibility guidance.
- `.agents/skills/playwright-browser/`: shared browser development and testing guidance.

The Guardian's in-app browser is separate from these development skills. Its
`web_search` and `open_url` tools are defined in
`app/src/services/guardianWebTools.ts` and use the native Android browser module
in `app/android/app/src/main/java/com/ourhangout/browser/`.
