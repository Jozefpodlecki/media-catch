# Third-party components

Original project code is licensed under MIT; see the repository's `LICENCE`
file, also included at the package root. Third-party components retain their
respective licenses, including the FFmpeg core's GPL terms listed below.

This development extension bundles the following components locally. No CDN
scripts or remote FFmpeg code are loaded at runtime.

- React / React DOM 19.3.1: MIT, https://github.com/facebook/react
- FFmpeg JavaScript wrapper 0.12.15: MIT, https://github.com/ffmpegwasm/ffmpeg.wasm
- FFmpeg WebAssembly core 0.12.10: GPL-2.0-or-later (the installed package's license declaration), https://github.com/ffmpegwasm/ffmpeg.wasm
- Tailwind CSS 4.3.5: MIT, https://github.com/tailwindlabs/tailwindcss

Available package license files and the FFmpeg project's GPLv2 license text
(https://github.com/FFmpeg/FFmpeg/blob/master/COPYING.GPLv2) are retained in vendor/. Build tooling is
recorded in package-lock.json. The FFmpeg core build includes FFmpeg and codec
libraries; its source/build recipes and component notices are available from
the upstream FFmpeg.wasm project. Review the corresponding source and licensing
requirements before distributing modified FFmpeg binaries or a published add-on.

The packaged FFmpeg wrapper worker has one documented change: its dynamic core
import is replaced with a literal import of ../core/ffmpeg-core.js. This confines
module loading to the bundled core. scripts/build/vendor.mjs checks this patch against
the pinned wrapper source. The wrapper's runtime API still receives local
extension URLs for its worker, core, and WebAssembly file.
