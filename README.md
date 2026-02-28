# Project Flippi

A content creation toolkit for Super Smash Bros. Melee. Project Flippi streamlines the process of creating shorts, clip compilations, and set VODs by orchestrating OBS Studio, Project Clippi, Slippi Launcher, AI tools (optional), and YouTube uploads into a single unified interface.

Built with Electron, React, and TypeScript.

## Features

- **Recording Stack Management** — Launch and manage OBS, Clippi, and Slippi with one click
- **OBS Integration** — WebSocket-based control of OBS recording, replay buffer, and streaming
- **Game Capture Monitoring** — Automatic detection of active game content via screenshot analysis
- **Clippi Sync** — Automatic combo data configuration for Project Clippi
- **Event Management** — Create and organize event folders with structured recording workflows
- **Cross-Platform** — Supports Windows, macOS, and Linux

## Prerequisites

The following external applications must be installed and configured:

- **[OBS Studio](https://obsproject.com/)** with the OBS WebSocket plugin:
  - OBS 27 or earlier: Install [obs-websocket 4.9.x](https://github.com/obsproject/obs-websocket/releases/tag/4.9.1)
  - OBS 28+: Install [obs-websocket 4.9.1-compat (Qt6)](https://github.com/obsproject/obs-websocket/releases/tag/4.9.1-compat)
- **[Project Clippi (Flippi Fork)](https://github.com/project-flippi/project-clippi)** — The Flippi-specific fork of Project Clippi is required
- **[Slippi Launcher](https://slippi.gg/)** — For Slippi Dolphin replay and live game integration
- **Node.js** >= 14.x

## Install

Clone the repo and install dependencies:

```bash
git clone https://github.com/project-flippi/project-flippi-app.git
cd project-flippi-app
npm install
```

## Development

Start the app in development mode with hot module reloading:

```bash
npm start
```

Other useful commands:

```bash
npm run lint       # Run ESLint
npm run lint:fix   # Auto-fix lint issues
npm test           # Run Jest tests
```

## Building

Build and package for your platform:

```bash
npm run build      # Build main and renderer for production
npm run package    # Package as distributable installer
```

## Friends of Flippi

Project Flippi is proudly supported by [Lil Nouns](https://lilnouns.world/) by winning the [Lil Nouns Software Round](https://nouns.gg/c/lilnouns/rounds/lilnouns-software), hosted on [Nouns.gg](https://nouns.gg/). Learn more at [flippi.gg](https://flippi.gg).

<a href="https://lilnouns.world/"><img src="assets/lil-nouns-logo.png" alt="Lil Nouns" height="60" /></a>
&nbsp;&nbsp;&nbsp;
<a href="https://nouns.gg/"><img src="assets/nounsgg-logo.png" alt="Nouns.gg" height="60" /></a>

## License

MIT
