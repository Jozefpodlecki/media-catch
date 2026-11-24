# State management

State follows the lifetime of its owner. Background snapshots describe browser
activity; UI drafts describe user intent. Polling must update the former without
replacing the latter.

## Ownership and lifetime

| Owner                               | State                                                          | Lifetime                                         |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Background blob/media modules       | Enabled sessions, authorized frames, catalog, conversion       | Persistent background session                    |
| Background history/download modules | Attempt metadata, download IDs, object URL cleanup             | Background session; at most 100 history entries  |
| Settings repository                 | Versioned defaults and origin overrides                        | Firefox local extension storage                  |
| `ApplicationProvider`               | Selected view and theme                                        | Open UI                                          |
| `SourceProvider`                    | Source tab, URL/title, workspace revision, source error        | Open UI                                          |
| `TaskProvider`                      | Pending action IDs, latest feedback                            | Current source workspace                         |
| Blob/image/media/history providers  | Snapshots, drafts, selections, filters, sync errors            | Current source workspace; survives view switches |
| `SiteSettingsProvider`              | Saved document, pending edits, optimistic settings, errors     | Open UI, synchronized with stored settings       |
| Input components                    | Menu visibility, focus, keyboard highlight, local input drafts | Mounted control                                  |

Closing the UI does not cancel a background conversion or download. Reloading the
extension clears runtime sessions and history. Site settings already use storage
in the current working tree; they survive UI closure and extension restarts.
History and captured payloads are not persisted by settings.

## Source workspace transitions

`ui/state/source.ts` owns the pure source reducer. `SourceProvider` owns browser
queries and listeners, rejects superseded resolutions, and removes listeners on
unmount. The reducer increments the workspace revision for a new tab, changed
URL, explicit loading/navigation event, or loss of an existing source. Title-only
updates and error dismissal preserve the revision.

`Providers.tsx` keys the task/feature subtree by source identity, revision and
loading state. Remounting resets drafts, filters, task feedback and request
scopes. Settings and application navigation/theme sit above that subtree.
Switching views within a source preserves drafts. Source navigation never starts
capture, DOM observation or network monitoring automatically.

A dashboard binds only to its explicit `source` query parameter. A popup resolves
the current active tab. An unlinked dashboard opens settings; the history entry
does not require a source tab.

## Reducer boundaries

Reducers accept discriminated actions and return new state without browser calls,
timers or mutation of previous state. Providers translate browser replies and user
actions into those transitions.

Blob scan actions record the edit revision when scanning starts. Results always
update the discovered frames, but only replace selection when the user has not
edited it during the scan. URL, frame and filename selection changes are atomic.

Media state separates the background snapshot from the playlist form. Editing a
playlist invalidates inspected variants and advances its revision. Inspection
results must match both URL and revision, including when the user switches away
from a URL and back. Polling leaves the filename and quality selection intact.

History snapshots replace entries while preserving the selected filter. Task
state tracks every pending action ID, so completing one overlapping task does
not clear busy status for the others. Only the most recently started task may
replace global feedback. A task finishing means its command finished; native
download completion is tracked separately in background history.

## Asynchronous requests

`createRequestScope()` assigns versions per resource and a generation per scope
lifetime. A newer read or mutation supersedes older replies for that resource.
An exclusive mutation invalidates prior reads and blocks new reads/mutations for
the same resource until it settles. Blocked calls return `false`; they are not
queued. Feature actions must not assume a blocked call sent a command.

`invalidate()` rejects a pending result, including its stale error. `dispose()`
prevents all outstanding results from being applied. React effect setup activates
the scope with a new generation; an old generation cannot write into the new one.
Current request failures propagate to task or sync error handling. Failed
mutations release their lock in `finally` so polling can resume.

These guards prevent applying stale replies; they do not abort commands already
executing in the background. Conversion cancellation uses its explicit command
and AbortController. `usePolling` polls every two seconds, skips hidden documents,
avoids overlapping ticks within the effect, resumes on visibility changes and
cleans up its interval/listener.

## Image state

The images reducer owns scan results, selected candidate IDs, URL source choice,
literal replacement fields, per-image overrides, pagination, and the background
batch snapshot. Polling updates only the batch snapshot. A rescan explicitly
replaces candidates and selects all results; changing the source or replacement
rule clears individual overrides. Invalid selected targets block submission.
Navigation disposes the request scope and resets these drafts.

URL patterns are derived from the original scan candidates with the pure
`shared/image-patterns.ts` extractor, rather than stored as another mutable
snapshot. Selecting a pattern updates selection atomically. Choosing a fixed
prefix initializes both replacement fields to the same value and clears
individual overrides, so the action alone does not rewrite URLs. Templates
never replace actual source URLs or manufacture query signatures.

The background owns one image queue per tab, deduplicated by final URL. It starts
native downloads sequentially and records each attempt through the common
history/download lifecycle. Closing the UI leaves the queue running; stopping
or closing the source tab discards only unstarted items. Snapshot counters report
native starts and start failures, while History reports actual file completion.

## Optimistic settings

Settings use `sitePreferences.v1`: schema version, monotonic revision, defaults,
and partial overrides for up to 200 normalized HTTP(S) origins. Scheme and port
are part of the key. Paths, queries, fragments and credentials are excluded.
Capture thresholds and request patterns are validated in the shared schema.

The background repository serializes read/modify/write operations so updates
from multiple extension pages merge. A failed write rejects its command without
poisoning later writes. Unsupported or invalid saved documents are reported and
are not silently replaced.

The preferences reducer retains:

- `saved`: the latest accepted authoritative document.
- `pending`: ordered `{ id, change }` edits awaiting acknowledgment.
- `config`: the saved document with pending changes reapplied in order.

Each snapshot or acknowledgment rebases pending edits over the latest saved
document. Lower revisions cannot replace newer saved data; explicit storage
deletion resets the baseline. A failed edit removes only that operation, so its
value rolls back while other pending changes remain visible. External updates
to other origins or defaults appear immediately under pending local edits.

If an external snapshot makes a pending edit invalid, optimistic replay skips
that edit. The operation remains pending until its authoritative command reports
success or failure; validation and errors still belong to the repository/command
path. Storage change events synchronize separate open UIs. Local form drafts in
the settings view remain a distinct input concern.

## Changing state safely

Choose the owner and lifetime before adding a field. Put transitions involving
several related values in one reducer action. Keep I/O in providers/services,
and make replies identify the draft or request they belong to. Never put bytes,
base64 payloads or tokens into UI history or persisted preferences.

Behavioral coverage lives in `tests/ui-state.test.mjs` and
`tests/settings.test.mjs`. Include delayed replies, failed writes with other
edits pending, cross-origin isolation, overlapping tasks and disposal when
changing these rules. Build-generated test exports live in `.build/ui-state.mjs`.
