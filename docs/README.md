# Documentation

Start with [usage](usage.md) to use the extension or
[development](development.md) to build and run it.

| Guide                                                   | Contents                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Usage](usage.md)                                       | Blob capture, media discovery, MP4 conversion, history and settings           |
| [Architecture](architecture.md)                         | Runtime boundaries, message routing, module ownership, generated assets       |
| [State management](state-management.md)                 | State owners, lifetimes, reducers, optimistic settings, asynchronous ordering |
| [Security and media constraints](security-and-media.md) | Permissions, page bridges, blob capture, HLS budgets, download cleanup        |
| [Development and verification](development.md)          | Commands, copied profiles, tests, browser checks, packaging, troubleshooting  |

Editable application code lives in `src/`. `extension/` is generated and is the
directory loaded into Firefox. These guides describe the current implementation,
including the existing dashboard and persisted site settings. Project instructions
remain in [AGENTS.md](../AGENTS.md); dependency notices are in
[third-party-notices.md](third-party-notices.md).
