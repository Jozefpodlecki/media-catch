# Development and verification

Use Node.js 20+ and PowerShell 5.1+. Run commands from the repository root.

```powershell
npm ci
npm run typecheck
npm test
npm run lint
```

## Commands and generated files

| Command                | Result                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run typecheck`    | Strict TypeScript without emitting files                             |
| `npm run compile`      | Typecheck, generate `extension/` and development test/preview assets |
| `npm test`             | Compile current source, then Node unit/regression tests              |
| `npm run lint`         | Compile current source, then Mozilla web-ext lint                    |
| `npm run format`       | Format editable source, scripts, tests and documentation             |
| `npm run format:check` | Check the same files with pinned Prettier                            |
| `npm run preview`      | Compile and serve React UI with mock APIs                            |
| `npm run build`        | Compile and package unsigned ZIP/XPI files                           |

Never edit `extension/` or `dist/` directly, or load `src/manifest.json`. Load
`extension/manifest.json` for manual temporary installation through
`about:debugging#/runtime/this-firefox`.

## Copied-profile development session

Close normal Tor Browser before starting a session to avoid process/data
contention. The defaults are:

```text
Browser: C:\Users\jozef\Desktop\Tor Browser\Browser\firefox.exe
Profile: C:\Users\jozef\Desktop\Tor Browser\Browser\TorBrowser\Data\Browser\profile.default
```

```powershell
powershell -NoProfile -File scripts/Install-Extension.ps1 -DryRun
powershell -NoProfile -File scripts/Install-Extension.ps1
```

Use `-BrowserPath` and `-ProfilePath` to override the installation. The session
copies the profile and uses web-ext with `keepProfileChanges: false`; it starts
on `about:addons`. A helper tied to the pinned web-ext debugger transport applies
and verifies Allow for private windows and restricted sites for this temporary
add-on only. Failure must be reported rather than disabling global protections.
Optional media host access still requires Firefox's permissions UI.

Keep the terminal open. After editing source, `npm run compile` updates the
watched runtime and reloads the add-on, clearing runtime sessions/history. To
stop the owned session:

```powershell
powershell -NoProfile -File scripts/Remove-Extension.ps1
```

This closes its development browser and tabs; save work first. The remover does
not target unrelated Firefox processes. A manually loaded extension must be
removed manually. Temporary installs disappear with their session; permanent
installation requires a separately signed XPI.

## Verification layers

Node tests cover compiled hook serialization, background authorization, native
download state reconciliation, playlist collection, UI reducers, request scopes,
settings storage and tooling. They use mocks and cannot prove real browser saves.

After compilation, explicit browser checks use a fresh profile and fixtures:

```powershell
node scripts/smoke-test-hook.mjs --browser 'C:\Program Files\Mozilla Firefox\firefox.exe'
node scripts/smoke-test-images.mjs --browser 'C:\Program Files\Mozilla Firefox\firefox.exe'
node scripts/smoke-test-media.mjs --browser 'C:\Program Files\Mozilla Firefox\firefox.exe'
node scripts/smoke-test-ui.mjs --browser 'C:\Program Files\Mozilla Firefox\firefox.exe'
node scripts/smoke-test-popup.mjs --browser 'C:\Program Files\Mozilla Firefox\firefox.exe'
```

The hook check verifies capture and exclusions with a real 11 MiB download. The
media check generates a one-second HLS fixture, tests network and DOM discovery,
HLS/file-blob MP4 output, encryption rejection and stalled-request cancellation.
Inspect actual native output paths, MP4 headers and sizes rather than relying
only on input size metadata in history.

The images check scans nested image links, plain/lazy sources, CSS backgrounds,
direct image links and open shadow roots. It preserves a signed full-size link,
applies a path replacement, deduplicates results, and verifies six actual PNG
files byte-for-byte at their native paths. Its fixture adds only
localhost access; that grant and runtime test exports never ship.

The UI check runs the actual React UI against preview APIs. It exercises custom
keyboard controls, accessible names, focus, history operations and overflow, and
saves a report/screenshot. It does not verify real downloads. Reports, fresh
profiles and output files stay under `artifacts/`.

The popup check opens the actual temporary add-on through the browser's Extensions
menu and measures the native content viewport, requiring the intended 400px
width. It uses a fresh copied test profile and only the documented per-add-on
private/restricted-site settings. Run it separately with the Tor executable to
verify Tor popup sizing; it does not test Tor website behavior. Preview iframe
checks cannot detect the native popup's content/viewport sizing loop.

Fixture permissions differ deliberately: the hook fixture adds localhost access;
the media fixture requires HTTP/HTTPS access to exercise permission checks.
`scripts/testing/runtime-fixture.mjs` exports and grants must never enter shipping
manifests or bundles. Windows string preferences passed through firefox-profile's
user.js serializer need double path escaping.

Report Node, Firefox UI, Firefox media/hook and Tor/site results separately.
Passing one layer does not establish the others.

## Visual preview

`npm run preview` serves `http://127.0.0.1:8000`. Use
`/preview-popup.html#media` for media and `/preview-history.html` for history.
Preview source navigation is mocked and excluded from shipping assets. Inspect
light/dark themes, narrow widths, long URLs, keyboard focus, dropdown boundaries
and zoom. Use F12 Inspector; a successful bundle alone proves none of these.

For the real popup, inspect the add-on in `about:debugging` and enable Disable
Popup Auto-Hide in its toolbox.

## Packaging

Builds preserve earlier packages and print exact output paths:
`dist/media-catch-yyyyMMdd-HHmmss-fffZ.zip` and `.xpi`, using UTC with
milliseconds. ZIP/XPI are identical unsigned bytes with the manifest at the
archive root. `package.ps1` remains a compatibility wrapper.

Packages contain generated runtime assets and notices, excluding TypeScript,
mocks, tests, source maps and `node_modules`. Preserve third-party notices and
report Mozilla review warnings. Signing and publication require a separate
explicit request.

## Troubleshooting

| Symptom                                     | Check                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Source edits do not appear                  | Compile `src/`; confirm the temporary add-on points at `extension/`                                     |
| No requests detected                        | Enable network detection, approve optional access, then reload/play; unattributed requests are excluded |
| Blob cannot be read                         | It may be MediaSource; inspect the HLS playlist instead                                                 |
| Capture stops after reload                  | Blob/DOM watches end on navigation; re-enable explicitly                                                |
| MP4 fails                                   | Check encryption/live status, codec compatibility, budgets, host access and WebAssembly availability    |
| Settings do not save                        | Inspect the settings error; invalid stored schema is preserved rather than overwritten                  |
| Download remains saving                     | Native completion is separate from command acceptance; inspect browser downloads and history errors     |
| Firefox fixture passes but a Tor site fails | Reproduce in Tor with its own site/auth/security constraints and report separately                      |
