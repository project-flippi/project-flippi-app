# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Flippi is an Electron + React desktop application for managing tournament recording workflows. It orchestrates OBS Studio, Project Clippi, Slippi Launcher, file management, AI tools, and YouTube uploads. Built on electron-react-boilerplate.

## Common Commands

```bash
npm start              # Run in development (Electron + Webpack dev servers with HMR)
npm run build          # Build main and renderer for production
npm run package        # Package as distributable installer (electron-builder)
npm run lint           # ESLint check on .js/.jsx/.ts/.tsx files
npm run lint:fix       # Auto-fix lint issues
npm test               # Run Jest tests
```

## Architecture

### Process Model (Electron)

The app follows Electron's multi-process architecture with three layers:

- **Main process** (`src/main/main.ts`) — App lifecycle, window creation, IPC handlers, process/feature polling, status broadcasting to all windows, auto-updater
- **Preload script** (`src/main/preload.ts`) — Bridges main↔renderer via `contextBridge`. Exposes namespaced APIs: `window.flippiSettings`, `window.flippiEvents`, `window.flippiStack`, `window.flippiObs`, `window.flippiStatus`
- **Renderer process** (`src/renderer/`) — React UI, communicates with main exclusively through the preload IPC bridge

### Key Services (Main Process)

All in `src/main/services/`:

- **statusStore** (`statusStore.ts`) — Pub/sub reactive state for service status. `patchStatus()` merges updates and notifies all subscribers. Main process broadcasts changes to renderer via IPC `status:changed` events.
- **obsConnectionManager** (`obsConnectionManager.ts`) — Singleton persistent OBS WebSocket connection (`obs-websocket-js`). Handles retry logic, auth failure detection, connection invalidation on settings change. Core methods: `ensureConnected`, `configureForEvent`, `startReplayBuffer`, `stopReplayBuffer`, `stopRecording`, `stopStreaming`, `getFeatureStatus`, `getSourcesList`.
- **obsService** (`obsService.ts`) — Helper for loading OBS connection settings from the settings store.
- **stackService** (`stackService.ts`) — Orchestrates the recording stack: launches OBS, Clippi, and Slippi; connects via WebSocket; configures recording folder; manages replay buffer/recording/streaming. Entry points: `startStack(eventName)`, `stopStack()`, `switchEvent(eventName)`, `relaunchClippi()`, `relaunchSlippi()`.
- **gameCaptureService** (`gameCaptureService.ts`) — Monitors an OBS game capture source via periodic screenshots analyzed with `sharp`. Detects whether game content is present. States: `unconfigured` → `monitoring` → `active`/`inactive`. Polling runs at 3s intervals while the stack is active.
- **clippiIntegration** (`clippiIntegration.ts`) — Syncs Clippi combo data config by writing `flippi-config.json` (atomic write via `.tmp` + rename) pointing to the event's `combodata.jsonl`. Also handles cleanup on stack stop.
- **eventService** (`eventService.ts`) — Lists event folders from `~/project-flippi/Event/`.
- **folderCreation** (`folderCreation.ts`) — Creates event folders by scaffolding the directory structure and empty placeholder files in code (no external template dependency). Includes `sanitizeEventFolderName()` for safe folder names.

### Polling Architecture (Main Process)

The main process runs multiple independent polling loops (all 3s intervals):

1. **OBS process polling** — Detects if OBS is running via `tasklist`. Resets stack state if OBS crashes unexpectedly.
2. **OBS feature polling** — Queries OBS WebSocket for live feature status (replayBufferActive, recording, streaming). Decoupled from process polling.
3. **Clippi process polling** — Detects Clippi process + reads `connection-status.json` for obsConnected/slippiConnected state.
4. **Slippi process polling** — Detects both Slippi Launcher and Slippi Dolphin processes separately.
5. **Game capture monitoring** — Polls OBS source screenshots when stack is running; managed by `gameCaptureService`.

### Cross-Process Communication (Clippi)

Flippi monitors Project Clippi's OBS and Slippi connection status via a shared file:

- **Clippi writes** `%APPDATA%/Project Clippi/connection-status.json` (`{ obsConnected: bool, slippiConnected: bool, updatedAt: number }`) whenever its Redux store connection state changes. Uses atomic writes (`.tmp` + rename).
- **Flippi reads** this file every 3s in `startClippiProcessPolling()`. If the process is running and the file is valid, connection values are patched into `statusStore`. If the process is not running, values are set to `null`.
- In dev mode, since Clippi runs under `node.exe`/`electron.exe` (not `Project Clippi.exe`), Flippi falls back to treating Clippi as running if the status file was updated within the last 30 seconds.
- `ClippiServiceStatus.obsConnected` / `slippiConnected` use three states: `true` (connected), `false` (explicitly disconnected), `null` (unknown/no data).

### IPC Handlers

Registered in `src/main/main.ts`:

- `settings:get` / `settings:update` — Read/write app settings (invalidates OBS connection on change)
- `events:list` / `events:create` — Event folder management
- `stack:start` / `stack:stop` / `stack:switch` — Recording stack lifecycle
- `stack:relaunchClippi` / `stack:relaunchSlippi` — Relaunch individual stack components
- `status:get` — Get current service status snapshot
- `obs:getSources` — List OBS sources
- `obs:setFeature` — Toggle OBS features (replayBuffer, recording, streaming)

### Data Flow Patterns

**Status updates:** Services → `statusStore.patchStatus()` → main broadcasts `status:changed` via IPC → renderer `useServiceStatus()` hook re-renders UI

**Settings:** Renderer calls `flippiSettings.get()/update()` → main reads/writes via `electron-store` → if OBS settings changed, `obsConnectionManager.invalidateConnection()` is called

**Recording stack:** User triggers `flippiStack.start(eventName)` → main ensures folder exists, launches OBS/Clippi/Slippi if needed, connects WebSocket, configures recording output, syncs Clippi combo data → status updates flow back to UI

### Renderer Structure

- `src/renderer/views/main/` — Page-level components (MainPanel with sidebar nav, RecordingPanel, SettingsPanel)
- `src/renderer/components/` — StatusBar (service status with logo indicators), settings cards (OBSSettingsCard, YouTubeSettingsCard, TextAISettingsCard, ImageAISettingsCard), SecretInput
- `src/renderer/hooks/` — `useServiceStatus` (status subscription), `useSettings` (settings CRUD with draft/saved state management)

### Shared Types

`src/common/statusTypes.ts` — Types shared between main and renderer:
- `ConnectionState` — `'unknown' | 'disconnected' | 'connecting' | 'connected' | 'auth_failed' | 'error'`
- `GameCaptureState` — `'unconfigured' | 'monitoring' | 'active' | 'inactive'`
- `ObsServiceStatus` — processRunning, websocket connection, replayBufferActive, recording, streaming, gameCapture state
- `ClippiServiceStatus` — processRunning, obsConnected, slippiConnected, comboDataConfigWritten, activeEventName
- `SlippiServiceStatus` — processRunning, dolphinRunning
- `StackState` — running, currentEventName, startedAt
- `ServiceStatus` — combines all of the above

### Settings Schema

Defined in `src/main/settings/schema.ts`, persisted via `electron-store`:
- **OBS** — host, port, password, gameCaptureSource, enableReplayBuffer, startRecording, startStreaming
- **YouTube** — clientId, projectId, clientSecret (OAuth credentials)
- **Text AI** — provider (openai/gemini/claude), apiKey
- **Image AI** — provider (openai/gemini), apiKey

## Build System

Webpack configs live in `.erb/configs/` with separate configurations for main, renderer, preload, and DLL builds. The DLL build pre-bundles renderer dependencies for faster dev rebuilds.

## Key Dependencies

- Electron 35, React 19, React Router 7
- `obs-websocket-js` 4.0.3 (pinned) for OBS WebSocket protocol
- `sharp` (dynamic import) for game capture screenshot analysis
- `electron-store` for persistent settings
- TypeScript 5.8, Webpack 5, Jest 29

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- **test.yml** — Runs on push/PR: `npm run package` → `npm run lint` → `tsc` → `npm test` (macOS, Windows, Ubuntu; Node 22)
- **publish.yml** — Builds and publishes via electron-builder on push to main
- **codeql-analysis.yml** — Weekly CodeQL security scanning (JavaScript)

## Platform Notes

Cross-platform (Windows, macOS, Linux). Process detection and termination in `src/main/utils/externalApps.ts` uses `tasklist`/`taskkill` on Windows and `pgrep`/`pkill` on macOS/Linux. Executable paths in `src/main/services/stackService.ts` resolve per-platform (e.g., `obs64.exe` on Windows, `/Applications/OBS.app` on macOS, `/usr/bin/obs` on Linux). Clippi connection status path uses `app.getPath('appData')` for cross-platform resolution. ASAR unpack pattern covers `.node`, `.dll`, `.dylib`, and `.so` for native modules on all platforms.
