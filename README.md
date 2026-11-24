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

The installer compiles the extension and launches a temporary copied profile.
See [development](docs/development.md) for browser paths, manual loading, removal,
and verification. Builds are unsigned development packages.

## Documentation

- [Usage](docs/usage.md): images, blobs, HLS, history, and settings.
- [Development](docs/development.md): setup, commands, tests, and packaging.
- [Architecture](docs/architecture.md): modules and execution boundaries.
- [State management](docs/state-management.md): ownership and async updates.
- [Security and media limits](docs/security-and-media.md): permissions and constraints.

## Licence

Original project code is [MIT licensed](LICENCE). Bundled dependencies retain
their [third-party licences](docs/third-party-notices.md).
