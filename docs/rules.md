# Per-site automation rules

Rules connect observed network/media events to explicit extension actions. Saved
rules belong to an exact HTTP(S) website origin. Enable them on the current tab
with Preview or Arm; saving a rule never starts monitoring or downloading.

## Using rules

1. Open the extension from the source webpage and choose **Site rules**.
2. Enter a name, trigger, URL matcher/pattern and action, then save.
3. Choose **Preview site rules without downloading** to check matches first.
4. Disarm, then choose **Arm site rules and run actions** to execute saved enabled
   rules. Firefox requests optional HTTP/HTTPS access, including CDNs.
5. Start playback, change the media source, or perform the page action that makes
   the matching request. Review **Rule activity** and **History**.

For the requested workflow, use **Video / source DOM update**, **URL contains**
`.m3u8`, and **Auto**. A matching source change starts the existing local HLS-to-MP4
pipeline. A separate rule containing `blob:` can download readable file blobs.
MediaSource blobs represent streams and require the underlying playlist.

Use a precise host/path condition rather than a broad substring such as `video`
if a site makes many unrelated requests. A wildcard example is
`https://cdn.example/*/master.m3u8`.

## Trigger and action semantics

| Trigger                   | Events                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Network request completed | Successful attributable HTTP(S) requests with status 200–399, including CDN requests made by the armed tab        |
| Video / source DOM update | Authorized inserted video/source elements, src/type mutations and media load events in existing accessible frames |

DOM observations use a separate observer/token/frame authorization store from
manual Media & HLS observation. Arming does not take ownership of a manual watch;
disarming rules leaves that manual watch intact. The initial DOM snapshot is
catalogued but does not trigger rules. Arm before changing/playing the media.
For an explicit src mutation, the new src takes precedence over a stale currentSrc.

| Action                  | Result                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record match only       | Add an activity entry without downloading                                                                                                                             |
| Download original media | Start a native HTTP(S) download, or read and save a file blob through its source frame                                                                                |
| Convert HLS to MP4      | Start the existing validated, bounded HLS remux pipeline                                                                                                              |
| Auto                    | Readable blob URLs go to file download; HTTP(S) URLs ending in `.m3u8`, or reported with an MPEGURL MIME type, go to HLS conversion; other URLs go to native download |

An extensionless HLS endpoint can use an explicit HLS action. Auto can use the
network response Content-Type or source-element type as a hint, but the HLS
collector still validates the fetched playlist. Blob routing takes priority over
a stale HLS MIME hint. No action records a live video stream or bypasses encryption.

URL contains matching is case-insensitive. Wildcard matching is also
case-insensitive; `*` matches any sequence and the pattern covers the whole URL
host/path representation. Queries and fragments are excluded from matching and
patterns cannot contain `?`, `#`, credentials or control characters. The original
signed URL, including its query, is retained transiently for the actual action.
Templates, regex execution, custom JavaScript and chained actions are outside
this first schema.

## Lifetime and execution limits

An armed session continues in the background when the popup closes. It ends on
disarm, source URL change/navigation, tab closure, extension reload, permission
removal, or changes to that site's active rules. Returning to a website does not
rearm it. Starting a new session resets its duplicate tracking and match budget.

Disarming discards unstarted actions. Already initiated native downloads and
conversions continue; use the conversion cancel action or Firefox Downloads to
stop those. Site settings and rules remain saved after disarm.

- Up to 200 configured origins and 10 rules per origin.
- At most 10 accepted matches per armed session, including preview/record matches.
- At most two pending actions per tab. Additional matches are logged as skipped.
- Each rule/final URL pair runs once per arming. Changing signed query values
  makes a distinct URL, still subject to the session budget.
- The duplicate set keeps at most 100 keys per session; subsequent events are ignored.
- The activity log keeps 100 entries across tabs in background memory. Closing a
  tab removes its activity. URLs in that log omit queries and fragments.
- DOM observation retains its existing 100-update limit per authorized frame.
- HLS keeps all existing time/size/asset limits and the single-conversion limit.
  If conversion is busy, another HLS rule action reports failure rather than
  creating an unbounded conversion queue. It is not retried automatically.

Rule activity distinguishes Preview, Recorded, Started, Skipped and Failed.
Started means the extension submitted the action, not that a file completed.
History entries identify the responsible rule and follow native completion and
conversion errors. Rule-created history metadata also omits URL queries and
fragments, while the original signed URL is used for the actual read/download.
A late failure from a conversion appears in History.

## Storage and state ownership

`browser.storage.local['siteRules.v1']` stores this independently versioned
document. Existing `sitePreferences.v1` settings do not need migration:

```json
{
    "version": 1,
    "revision": 1,
    "sites": {
        "https://example.com": [
            {
                "id": "hls-source",
                "name": "Save HLS source changes",
                "enabled": true,
                "trigger": "dom",
                "match": "contains",
                "pattern": ".m3u8",
                "action": "auto"
            }
        ]
    }
}
```

The background repository validates documents and serializes updates so two UIs
cannot overwrite unrelated rule edits. Invalid/unsupported documents are reported
without replacement. Failed writes do not block later writes. Origins include
scheme and port, exclude paths/queries, and do not implicitly include subdomains.

The existing Settings reset/forget controls affect threshold/filter preferences;
delete automation rules separately in Site rules.

Only configured rule fields persist. Matched URLs, query signatures, activity,
payloads, sessions and armed state stay in memory. Regular/private windows share
stored rules, while each tab has its own explicit armed session. As with existing
settings, the development installer uses a copied profile; changes made there do
not automatically transfer into a later fresh development session.

| Module                      | Owner                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `shared/rules.ts`           | Discriminated contracts, validators, pure URL matching and action routing              |
| `runtime/rules/storage.ts`  | Serialized rule persistence                                                            |
| `runtime/rules/events.ts`   | Explicit internal event publication/subscription                                       |
| `runtime/rules/engine.ts`   | Arming, session identity, deduplication, bounded queues, action orchestration and logs |
| `runtime/rules/commands.ts` | Validated extension-page rule commands                                                 |
| `ui/state/rules.ts`         | Pure editor/document/runtime transitions                                               |
| `ui/features/rules/`        | Feature provider and React/Tailwind view                                               |

The UI never sends page-supplied commands directly to downloads or conversion.
Page bridges still send only bounded media observations. Background authorization
checks the browser-provided sender tab/frame and enabled frame set before rule
events are published. Correlation tokens remain visible to the page and are not
a security boundary. User-armed rules intentionally react to matching page media;
careful matching conditions determine which URLs the user has authorized.

The engine rechecks the tab origin and permissions before actions and rejects
old session work after disarming/navigation. Observer installation also checks
ownership after asynchronous discovery/injection, preventing late installation
from resurrecting a stopped watch.

## Verification

`tests/rules.test.mjs` covers schemas, origin isolation, literal/glob matching,
HLS classification, storage failures/concurrency, draft preservation, sender/frame
authorization, preview, deduplication, bounded queues, revocation, navigation and
disarming during observer discovery.

The Firefox UI smoke check covers saving, editor acknowledgment, preview versus
arming, draft preservation, narrow layouts, persistence/session continuity across
UI reopening, and deleting rules. The live media check generates local HLS and
verifies preview without files, rule-triggered HLS MP4 output, duplicate suppression,
a DOM-triggered file-blob download, and manual-observer isolation. It checks actual
native file paths and MP4 headers/sizes. These are Firefox fixture checks, not a
claim that arbitrary Tor sites or protected streams work.
