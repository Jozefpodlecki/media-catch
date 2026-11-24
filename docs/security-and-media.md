# Security and media constraints

## Permissions and trust

The current manifest requests `activeTab`, `scripting`, `downloads`, `webRequest`
and `storage`. Storage is used by the existing settings implementation.
HTTP/HTTPS host access is optional and requested through the visible network
enable action. Development private-window/restricted-site choices do not grant
optional host access.

Background authorization uses browser-provided extension URLs, tab/frame IDs,
enabled sessions and bounded payload validators. MAIN-world correlation tokens
and counters are visible to the page and are not credentials. Page bridges may
report only `auto-blob` or `media-observed`; they cannot invoke history, monitoring
or conversion commands, and cannot scan or queue image downloads.

Page strings remain untrusted. Render them through React text nodes, sanitize
filenames, and bound metadata lengths. Never add HTML sinks or evaluate strings.
Only bounded base64 data URLs reach background blob decoding. Do not fetch an
arbitrary URL returned by a page; derive actual size/type from decoded bytes.

Network observation is passive and only records explicitly enabled tabs.
Requests with `tabId: -1` are not assigned by guesswork. Fetching uses Firefox's
network stack with normal credentials and optional host access. The extension
does not alter headers, cookies, proxy configuration or global protections.

## Blob and DOM observation

Image scanning uses an isolated injected function and returns bounded HTTP(S)
image/link metadata. Only a user command from an extension page can submit a
batch, capped at 500 URL/frame pairs. Every target is validated before starting
any downloads. The native downloads API handles image responses without routing
them through blob decoding or fetching them in a system process. This requires
the existing downloads permission rather than optional media host access.
Images are not loaded into the extension UI automatically. Signed queries remain
untrusted strings; transformations cannot derive new server signatures.

Blob capture wraps future `URL.createObjectURL` calls in accessible existing
frames. Preserve native arguments, receiver, return value and exceptions. Retain
Blob objects so immediate URL revocation does not invalidate capture. The native
Blob size getter handles cross-realm objects.

Skip streams, duplicate objects, blobs at or below the threshold, and objects
larger than 64 MiB. There are two pending captures and ten attempts per tab
session. Stop clears retained data/listeners and restores a wrapper only while
the extension still owns it. Self-test uses an empty Blob and must not download.

Workers, cached originals, earlier calls and future frames are not hooked.
Navigation/pagehide ends blob and DOM watches. Network monitoring persists for
enabled tabs across reloads until stopped, closed or extension restart.

DOM observation requires frame authorization before injection. MutationObserver
and `loadstart`, `loadedmetadata`, `emptied` events report bounded metadata for
existing/inserted video/source elements and connected `src`/`type` mutations.
Detached constructors and closed shadow roots are outside this observer.

## HLS and file conversion

A MediaSource blob URL represents a stream, not a readable file. Discover the
underlying playlist instead. Readable file blobs may be remuxed when their codecs
support MP4 stream copy. Conversion does not universally transcode codecs.

The collector resolves relative playlist references, master variants and default
audio, byte ranges and init segments. It rejects encrypted/DRM and live or
open-ended media. Every consumed media URI is rewritten to a local filename after
fetching; FFmpeg receives local files rather than network addresses.

| Resource               | Limit        |
| ---------------------- | ------------ |
| Total fetched input    | 64 MiB       |
| Remux output           | 64 MiB       |
| Assets                 | 500          |
| Playlist nesting       | Four levels  |
| Individual request     | 30 seconds   |
| Remux execution        | Two minutes  |
| Whole conversion       | Five minutes |
| Concurrent conversions | One          |

Cancellation aborts reads and terminates the worker. Release worker/virtual FS
memory on success, failure and cancellation. FFmpeg core and worker assets are
packaged locally; there is no native/system FFmpeg network fetching, remote
conversion service or runtime core download.

Authenticated sites may still require player-specific referrers or cookie
isolation that these reads do not reproduce. Tor configurations that disable
WebAssembly can prevent conversion. Firefox fixtures do not establish compatibility
with an arbitrary Tor site.

## History and native downloads

History stores at most 100 attempt metadata entries across tabs in memory.
Started/saving means the native download was accepted. Completion, interruption
and cancellation follow native events, with lookup reconciliation for events
that arrive before the download ID is associated with an attempt.

Clear/eviction removes history-to-download associations without canceling files
or breaking object URL cleanup. In-flight work cannot reinsert a cleared attempt.
History must not store payload bytes, base64, tokens or absolute native paths.
Persistent background lifetime owns object URLs until native download cleanup.

## Distribution review

Mozilla lint may report review warnings for bundled React DOM's internal
`innerHTML` implementation. Application code uses React text rendering. Report
these warnings and any CSP warnings; do not hide them or call such a result
warning-free. Review the pinned package notices and FFmpeg distribution/source
licensing before publishing. The normal development flow produces unsigned
packages and does not sign or publish them.
