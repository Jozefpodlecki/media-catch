# Media Catch

A Tor/Firefox extension for bulk image downloads, blob capture, HLS discovery,
media observation, and local MP4 remuxing.
Built with React, TypeScript, and Tailwind, with FFmpeg packaged in the extension.

Supports finished, unencrypted HLS and readable file blobs. MediaSource URLs need
the underlying playlist; live streams and DRM are unsupported.

## Quick start

Requires Node.js 20+ and Windows PowerShell 5.1+.

```powershell
npm ci
npm run preview
```

The preview uses mock data. To try the extension in Tor, close normal Tor Browser,
then run:

```powershell
powershell -NoProfile -File scripts/Install-Extension.ps1
```

The installer compiles the extension, launches a temporary copied profile, and
pins Media Catch to its toolbar.
See [development](docs/development.md) for browser paths, manual loading, removal,
and verification. Builds are unsigned development packages.

Run `npm run fixtures` for the image gallery at
`http://127.0.0.1:8001/fixtures/1-gallery` and the JavaScript HLS-to-blob video
fixture at `http://127.0.0.1:8001/fixtures/2-hls`. The same pages power the browser
E2E checks. The video fixture supports a generated local clip and a public Mux sample.

## Documentation

- [Usage](docs/usage.md): images, blobs, HLS, history, and settings.
- [Site rules](docs/rules.md): network/DOM triggers and automatic media actions.
- [Development](docs/development.md): setup, commands, tests, and packaging.
- [Architecture](docs/architecture.md): modules and execution boundaries.
- [State management](docs/state-management.md): ownership and async updates.
- [Security and media limits](docs/security-and-media.md): permissions and constraints.

## Licence

Original project code is [MIT licensed](LICENCE). Bundled dependencies retain
their [third-party licences](docs/third-party-notices.md).
