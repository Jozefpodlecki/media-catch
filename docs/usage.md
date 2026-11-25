# Using the extension

Open the popup from the webpage containing the media. For installation and
browser setup, see [development](development.md).

## Images

Open **Images** and choose **Scan page images**. The scan traverses the whole
currently loaded document, including off-screen elements, accessible frames and
open shadow roots. It collects `img` sources, `currentSrc`, responsive `srcset`
entries from images/pictures, common lazy attributes (`data-src`, `data-original`,
`data-lazy-src`, `data-srcset`), computed CSS background URLs and direct links
whose URL has an image extension. Image records retain the nearest enclosing
`a[href]`, including links with nested elements. Relative URLs resolve against
the document base URL; only HTTP(S) URLs without credentials are retained.

Exact duplicate source/current-source/link combinations are collapsed. The scan
is bounded to 10,000 elements and 100 document/shadow roots per accessible frame,
with up to 500 candidates across frames. A limit notice means results may be
incomplete. Data/blob URLs, closed shadow roots and inaccessible frames remain
outside the scan. It does not scroll, trigger lazy loaders, crawl linked pages,
or parse script data. Scroll/load more content yourself and rescan as needed.

The URL source defaults to the enclosing link when available, otherwise the
browser-selected image source (`currentSrc`, falling back to `src`). Choose
**Image source** to ignore enclosing links. Expand **Source URLs** to compare the
original `src`, rendered source, and link.

**URL patterns** groups the observed source and enclosing-link URLs by origin
and path shape. Numeric directories become `{number}`, long hexadecimal IDs
become `{id}`, filenames become `{file}.extension`, and query values become
`{value}` while retaining their parameter names. For example:

```text
https://cdn.example/images/thumb/{number}/{file}.jpg?secure={value}
```

Each group shows the number of unique URLs, matching image references, and an
expandable example. **Select images for pattern** replaces the image selection
with that group's references; your URL source choice still controls downloads.
**Use path prefix for pattern** fills both transformation fields with the fixed
prefix, such as `/images/thumb/`. Change Replace to `/images/full/` to transform
it. Placeholders are descriptive templates, not executable matching expressions
or generated download URLs. No requests are made just to discover patterns.

Use **Find in image URLs** and **Replace in image URLs** for literal replacement,
for example `/thumb/` to `/full/`. The final download URL is editable per image.
Changing the source or replacement rule resets individual edits. Selection,
rules, and URL edits survive view switches and reset on source navigation;
they are not persisted in website settings.

A signed URL often requires a different signature for the full-size resource.
Replacing `/thumb/` preserves its existing query text; it cannot generate a new
`secure` value. Prefer an enclosing full-image link with its own signature, or
paste the valid full URL into the individual download field.

All scan results are initially selected. Deselect unwanted images or select all,
then choose **Download selected images**. Invalid selected URLs block download;
duplicate final URLs are downloaded once. The preview displays 25 results per
page, while selection and download cover all pages. A link to an HTML gallery
page saves that response; the extension does not crawl the page for another image.

Firefox's native downloads API saves each URL with a sanitized filename and
unique names on conflict. It uses the browser's download network path, with no
external image processing or system fetch. This does not request optional media
host permissions or enable monitoring. Server authentication and signature
restrictions can still cause downloads to fail.

One batch per source tab queues starts sequentially in the background and
continues when the popup closes. **Stop queued image downloads** skips remaining
items; downloads already handed to Firefox continue. Closing the source tab
also stops the remaining queue. Queue progress reports starts and start failures;
**History** tracks each native completion/interruption separately. A failed file
does not stop the rest of the batch. Only the latest 100 attempts remain in history.

## Site rules

Use **Site rules** to save per-website network or video/source rules. Choose a
trigger, URL condition and action, save, then explicitly Preview or Arm the tab.
Auto converts matching HLS playlists to MP4 and downloads other readable media.
Navigation and edits to active rules disarm the tab; closing the popup leaves an
armed background session running. See [the rules guide](rules.md) for setup,
examples, matching semantics and execution limits.

## Blobs

The popup uses icon actions with hover/focus tooltips and accessible names. The
main views are Blobs (download), Images (picture), Media & HLS (video), History
(clock), Site rules, and Settings. Custom
text fields, a size stepper, and keyboard-operated dropdowns share the same style.
Use the info icons for limits and explanations. Dropdowns support arrows,
Home/End, typeahead, Enter, and Escape.

The **Blobs** view can scan an accessible page for blob URLs or accept a pasted
URL and source frame. **Download original file** reads the file blob and opens Save
As. **Remux file blob to MP4** reads a file blob and repackages supported audio/video tracks
without re-encoding. Renaming a file is not conversion.

**Start blob capture** hooks future `URL.createObjectURL` calls in accessible existing
page frames. The default criterion is strictly above **10 MiB** (10,485,760 bytes)
and at most **64 MiB**. Retaining the Blob object allows capture even if the site
immediately revokes its URL. Duplicate Blob objects, small/oversized blobs, and
MediaSource streams are skipped. Queue capacity is two captures; each tab session
accepts at most ten attempts. Automatic saves avoid overwriting existing files.

**Diagnostics** shows installed/replaced hooks, call counts, streams,
filters, byte reads, bridge replies, and failures. **Test the hook without
downloading** creates an empty Blob and should increase the call/small-blob counts.
Watching stops on navigation/reload. Workers, cached originals, previous calls,
and future/inaccessible frames are not hooked.

A player `blob:` URL often represents **MediaSource**, not a complete file. It
cannot be converted by reading the URL. Find the actual playlist in Media & HLS.

## Network detection and video/source elements

In **Media & HLS**, set **Request URL contains** (default `.m3u8`; `*.m3u8` is also
accepted) and click **Enable network detection**. Firefox asks for optional
HTTP/HTTPS website access so cross-origin CDN requests can be observed and media
segments fetched. Only explicitly monitored tabs are recorded. Monitoring is
passive: it does not block or modify requests, headers, proxy settings, or cookies.
It remains on for that tab across page reloads until stopped, the tab closes, or
the extension/browser restarts. Enable it before reloading/playing the video.

Detection uses `webRequest`, including request completion/errors. Requests with
no attributable tab ID (including some worker/service-worker requests) are not
guessed or assigned to a tab. Revoking website access disables the browser's
ability to observe/fetch those hosts. The optional permission is not granted by
the development installer's two private/restricted-site settings.

Click **Observe video and source elements** (eye icon) to monitor accessible existing
frames. A MutationObserver records insertion of `<video>`/`<source>`, connected
`src`/`type` changes, and media load events. Existing elements are scanned too.
This does not patch DOM constructors, catch detached createElement calls, inspect
closed shadow roots, or attach to future frames. It stops on page reload.
At most 100 element updates and 100 detected resources are kept in memory.

## HLS to MP4

Choose a detected playlist or paste an HTTP/HTTPS URL. **Inspect playlist quality options**
lists master-playlist variants; the highest bandwidth is the default. Choose a
smaller rendition if needed, then click **Create MP4**. Progress and cancellation
are available while the background job runs, even if the popup is closed.

The extension downloads playlist/segments through Firefox's network stack with
fetch credentials enabled, and remuxes local files using single-threaded
FFmpeg.wasm. No external converter, native messaging host, or remote processing
service is used. A readable file blob can be remuxed through the Blobs view.

Supported: finished unencrypted HLS VOD, master/media playlists, MPEG-TS and
fragmented MP4 segments, init segments, byte ranges, and separate default audio
renditions. Codecs must support MP4 stream copying; this build does not transcode.
Limits: **64 MiB total fetched input, 64 MiB output, 500 assets, four nesting
levels, 30-second requests, two-minute remux, five-minute job**. One conversion
runs at a time. Encrypted/DRM playlists and live/open-ended playlists are rejected.
Private/container cookie isolation and referrer checks can still make authenticated
requests fail; this does not replay the player's request headers. Subtitles,
alternate audio selection, variable substitution, and low-latency HLS
are outside this prototype. Auth/referrer restrictions or Tor security settings
that disable WebAssembly can prevent a job from running; errors appear in history.

## History

The **History** view and full history page show the latest 100 attempts, including
manual/automatic blobs, HLS, and file-blob conversions. Filters separate active,
completed, failed/interrupted, canceled, and skipped attempts. Started/Saving
means the browser accepted the file; Completed requires a browser completion
report. Source details include truncated URLs, filename, frame, and download ID.

Metadata stays in memory. No payloads, base64 bytes, or tokens are stored in
history; restarting/reloading clears it. Clear does not cancel downloads, delete
files, or clear the browser's separate records. Blobs filtered before an attempt
and unobserved worker calls do not create history entries. Old attempts cannot
be reconstructed.

## Settings and dashboard

Settings provides global defaults and per-website overrides for capture size
and request matching. Overrides use the source website origin, including scheme
and port. Preferences are saved in the browser profile and synchronize across
open extension pages. They never start monitoring automatically.

Open the dashboard from the popup to keep a full page linked to that source tab.
Opening the options page directly provides settings without selecting a source
webpage. Use Reset to inherit defaults again, or forget saved website overrides
while retaining global defaults.

For detailed limits and permission boundaries, see
[security and media constraints](security-and-media.md).
