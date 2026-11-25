# Project instructions

## Purpose and environment

Build a Tor/Firefox extension for blob capture, HLS discovery/conversion, media
element observation, and session history. Use Node.js 20+ and PowerShell 5.1+.
Default browser: `C:\Users\jozef\Desktop\Tor Browser\Browser\firefox.exe`.
Default profile: `C:\Users\jozef\Desktop\Tor Browser\Browser\TorBrowser\Data\Browser\profile.default`.
Allow script overrides for other installations.

## Architecture and source of truth

The user explicitly requested React, TypeScript, Tailwind, request detection,
HLS-to-MP4, and video/source observation. Editable code is under src/. Strict
TypeScript is checked before generating extension/, the directly loadable runtime.
Do not edit extension/ or dist/ by hand. Do not load src/manifest.json directly.
Keep Manifest V2: persistent background lifetime owns download object URLs.

- background.ts: composition root, sender authorization, validated command routing.
- auto-watch.ts: blob-watch lifecycle, capture authorization, queue coordination.
- media-runtime.ts: media command orchestration and public state composition.
- injected/: self-contained functions serialized into MAIN/ISOLATED page worlds.
- runtime/history.ts and downloads.ts: private stores and native download lifecycle.
- runtime/media/: catalog, monitoring, observation validation, reads, conversion jobs.
- shared/: explicit data contracts, discriminated command types, validators, shared limits.
- hls/: pure playlist parser/collector and local FFmpeg adapter.
- ui/: React TSX, typed API helper, Tailwind source CSS; no runtime CDN.
- examples/: manual pages and preview-only mocks, excluded from runtime packages.
- tests/: Node unit/regression tests. Browser smoke tests are explicit scripts.
- scripts/: small command entry points; implementations live in build/, browser/,
  session/, preview/, lib/, and testing/. package.ps1 is a compatibility wrapper.
- extension/, .build/, .dev-session/, artifacts/, dist/: ignored generated data.

## Commands and validation

`npm ci`; `npm run typecheck`; `npm run compile`; `npm test`; `npm run lint`;
`npm run build`; `npm run preview`.
Use `npm run format` / `npm run format:check` for consistent editable-source formatting.
Prettier is pinned locally. Use four spaces, never tabs; .editorconfig agrees.
Prefer self-explanatory code without comments. Keep architectural explanations and
non-obvious browser constraints in documentation. Preserve third-party notices.
Use explicit imports and small modules with one responsibility. Keep mutable state
private, expose feature operations, validate unknown messages before dispatch, and
retain strict TypeScript, unknown catch variables, and unused-code checks. Avoid
service containers, circular imports, and abstractions without a concrete purpose.
Install: `powershell -NoProfile -File scripts/Install-Extension.ps1` (supports -DryRun).
Remove: `powershell -NoProfile -File scripts/Remove-Extension.ps1`.
Build/install/preview/test/lint must compile current source first. After source
edits in a running web-ext session, npm run compile updates the watched runtime.
Update generated paths in tests, scripts, and docs together when changing layout.

Use meaningful tests for behavior changes. Explicit live checks:
`node scripts/smoke-test-hook.mjs --browser <Firefox executable>` and
`node scripts/smoke-test-media.mjs --browser <Firefox executable>`.
They create fresh profiles/test extension fixtures and save files/reports only
under artifacts/. The hook fixture adds localhost access; the media fixture moves
optional HTTP/HTTPS access into required access to test its permission check.
These grants and testing/runtime-fixture.mjs exports must never enter shipping
manifests or bundles. Escape Windows paths twice when passing
string prefs through firefox-profile's user.js serializer. Verify actual native
download paths and MP4/file sizes, not just history's input metadata.

The local live media test verifies a generated one-second HLS, network matching,
video/source insertion and src mutation, real MP4 output, file-blob remuxing, and
encryption rejection. Report Firefox verification separately from Tor/site tests.

## Profiles and installation

Use web-ext with keepProfileChanges:false, copying the source profile. Never
modify the installed browser, normal profile, proxy/signing/security settings,
or unrelated add-ons. Keep normal Tor closed during development to avoid Tor
process/data contention. Removal targets only the owned development session.
Temporary builds disappear with the session; permanent distribution requires a
separately signed XPI. Do not sign or publish without an explicit request.

Start on about:addons. The user requested automatic Allow for private windows
and sites with restrictions, plus toolbar pinning. Apply only these per-addon choices to our temporary
add-on in the copied profile through the local development debugger. Verify both,
fail clearly on failure, and never globally disable domain protections. The helper
is tied to the pinned web-ext transport. Optional media host access is separate
and granted through Firefox's permissions UI, not silently by this helper.

## Permissions, messages, and memory

Base permissions: activeTab, scripting, downloads, webRequest. HTTP/HTTPS host
access is optional, requested by the user-facing network enable action to cover
CDNs. Network observation is passive and only records enabled tabs. Do not modify
requests, headers, cookie databases, proxy routing, or browser protections.
Requests with tabId:-1 cannot reliably be attributed to a tab; do not guess.

Use browser-supplied sender identity, tab/frame IDs, enabled sessions, and bounded
payload validation. Page bridges may send only auto-blob or media-observed, never
history, conversion, or monitoring commands. Extension-page tabs are recognized
by their browser-provided extension URL. MAIN-world tokens/counters are visible
to the page and are correlation/diagnostic data, not a security boundary.

Only bounded base64 data URLs can reach background blob decoding; never fetch
a returned arbitrary HTTP URL. Determine actual blob size/type from decoded data.
All page strings are untrusted. React text rendering is required; do not add
dangerouslySetInnerHTML, code-string evaluation, or unsanitized filenames.
No telemetry, external conversion services, persisted history/payloads, or tokens.

## Hooks and element observation

Injected functions are serialized without their outer closure. Bundling may import
them into the background, but their serialized bodies must contain all runtime
dependencies, without imported closures, compiler helpers, or name wrappers.
Keep background bundles unminified with keepNames disabled. Tests execute the
compiled hook's serialized source without its module closure. Type-only imports
must disappear. Keep native createObjectURL arguments,
receiver, return value, and exceptions. Retain Blob objects to survive immediate
revocation. Use the native Blob size getter for cross-realm objects. Skip streams,
duplicates, <=threshold and >64 MiB objects; two pending and ten attempts per tab.
Stop clears retained data/listeners and restores only a still-owned wrapper.
Navigation/pagehide ends blob/DOM watches; network watches persist for enabled
tabs across reloads until stopped or closed. Extension reload clears all sessions.

Diagnostics distinguish installed/replaced hooks, calls, type/size filters,
byte reads, replies, rejections, timeouts. Self-test uses an empty Blob and must
not download. Workers, cached originals, old calls, and future frames are not
hooked. Do not describe automatic history as a log of all page API calls.

DOM monitoring uses MutationObserver plus loadstart/loadedmetadata/emptied events.
Record bounded metadata for existing/inserted video/source elements and connected
src/type changes. It does not intercept detached constructors or closed shadow
roots. Establish frame authorization before injecting the observer.

## HLS and conversion

Fetch media through Firefox with explicit optional host access and normal
credentials. No native/system ffmpeg fetching outside Tor. Validate HTTP(S),
playlist format, relative URIs, master variants, default audio, byte ranges, init
segments, nesting and budgets. Fetch segments first, rewrite all consumed media
URIs to local filenames, then remux using the packaged single-thread FFmpeg core.
No remote runtime scripts, core downloads, or network protocols inside FFmpeg.

Reject encrypted/DRM and live/open-ended playlists clearly. Support compatible
MP4 stream copy, not universal codec conversion. A MediaSource URL is not a file;
use its playlist. File blobs can be remuxed when readable. Cap input/output at
64 MiB, assets at 500, nesting at four, requests at 30 seconds, remux at two minutes,
whole jobs at five minutes. One conversion at a time; cancellation aborts reads
and terminates the worker. Release worker/FS memory on every terminal path.

Retain pinned package notices. Build patches one dynamic FFmpeg core import to a
literal local import; assert the expected upstream pattern before applying it.
Mozilla lint review warnings for bundled React DOM innerHTML (and any future CSP warnings)
must be reported/documented, not described as zero warnings or hidden. Application
code must not add unsafe HTML sinks. Review distribution/source licensing before
publishing FFmpeg-based binaries; local unsigned development is the current flow.

## History and UI

Keep at most 100 attempt metadata records in memory across tabs. Include manual,
automatic, HLS and file-blob conversions with clear lifecycle states. Started is
not Completed. Follow native completion/error/cancel events, reconcile early
finishes, retain errors arriving before state, and keep status lookup failure from
turning a successful start into failure. Clear/eviction removes ID associations
without canceling files or breaking object URL cleanup. In-flight work must not
resurrect cleared records. Do not store bytes, base64, tokens or absolute paths.

Use the React/Tailwind design system: clear Blobs, Media & HLS and History views,
readable light/dark themes, responsive layouts, labeled controls, visible focus,
honest empty/error/progress states, cancel actions, and safe long URL wrapping.
The user prefers icons over redundant visible labels and custom input components.
Use ui/components.tsx for icon actions, integrated text fields, the size stepper,
and keyboard-operated combobox/listbox. Keep accessible names, hover/focus tooltips,
real associated input labels, validation, and disabled states. Keep essential headings
and feedback concise; put supporting explanations in info controls. Avoid duplicate
single-option dropdowns and repeated descriptions. Tooltips and menus must stay
inside the viewport, including at narrow widths. Validate keyboard selection,
Escape, Home/End, typeahead, and focus restoration when changing custom controls.
Keep implementation detail in diagnostics/docs unless it affects a user choice.
UI main.tsx is bootstrap only. app/ owns source-tab lifecycle, navigation/theme,
task feedback, and provider composition. features/ owns blob, media, and history
reducers/controllers/views; state/ contains pure typed reducers. Keep state and
action contexts separate. Views call feature actions rather than browser APIs or
generic setter collections. Local interaction state belongs inside input components.
services/ owns polling and request scopes: reject stale replies, pause reads during
mutations, clear timers/listeners, and dispose old requests on navigation/unmount.
Polling must not replace form drafts, inspected quality choices, or history filters.
Keep settings/ above the source workspace. Defaults plus partial overrides are
keyed by normalized HTTP(S) origin, with paths/query/fragment excluded. Forms and
task state reset on source navigation; site preferences survive within the open UI.
Site preferences are persisted in browser.storage.local with a versioned schema;
siteRules.v1 separately stores validated per-origin automation rules. Armed rule
sessions, activity, discovered URLs and payloads remain in memory. Rules require
explicit per-tab preview/arming, and navigation or saved rule changes disarm them.
Do not silently persist site browsing data or auto-start monitoring on navigation.
Cover reducer transitions, stale replies, overlapping tasks, and site isolation
with behavioral tests. Preview source navigation is mock-only and never ships.
Preview APIs compile outside extension/ and never ship. Inspect actual previews
in light/dark and narrow widths; use Inspector and check keyboard/zoom where
available. A successful build does not prove visual or Tor-site behavior.
After compiling, `node scripts/smoke-test-ui.mjs --browser <Firefox executable>`
checks the actual React controls in Firefox with preview APIs. It saves a report
and screenshot under artifacts/. This is a UI check, not real download verification.

## Packaging

The manifest loads one persistent background.js bundle; feature state is shared
through module imports, never cross-script globals. popup.html and history.html
are explicit manifest/UI entry pages. An index.html is not required; do not add
a duplicate entry page without a separate user-facing purpose.

Build timestamped media-catch-yyyyMMdd-HHmmss-fffZ.zip/.xpi using UTC and
milliseconds, preserving earlier packages and printing exact paths. The manifest
must be at the archive root. Package only generated runtime assets and notices,
never TypeScript, mocks, tests, source maps or node_modules. ZIP and XPI are
identical unsigned bytes. Keep README and commands accurate.
