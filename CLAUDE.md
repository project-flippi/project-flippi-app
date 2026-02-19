# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Flippi is an Electron + React desktop application for managing tournament recording workflows. It orchestrates OBS Studio, file management, AI tools, and YouTube uploads. Built on electron-react-boilerplate.

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

- **Main process** (`src/main/main.ts`) — App lifecycle, window creation, IPC handlers, process polling (3s interval for OBS/Clippi/Slippi), status broadcasting to all windows, auto-updater
- **Preload script** (`src/main/preload.ts`) — Bridges main↔renderer via `contextBridge`. Exposes namespaced APIs: `window.flippiSettings`, `window.flippiEvents`, `window.flippiStack`, `window.flippiStatus`
- **Renderer process** (`src/renderer/`) — React UI, communicates with main exclusively through the preload IPC bridge

### Key Services (Main Process)

All in `src/main/services/`:

- **statusStore** — Pub/sub reactive state for service status. `patchStatus()` merges updates and notifies all subscribers. Main process broadcasts changes to renderer via IPC `status:changed` events.
- **obsConnectionManager** — Singleton persistent OBS WebSocket connection (`obs-websocket-js`). Handles retry logic, auth failure detection, and connection invalidation on settings change. Core methods: `ensureConnected`, `configureForEvent`, `startReplayBuffer`, `stopReplayBuffer`, `stopRecording`.
- **stackService** — Orchestrates the recording stack: launches OBS, connects via WebSocket, configures recording folder, manages replay buffer. Entry points: `startStack(eventName)`, `stopStack()`, `switchEvent(eventName)`.
- **folderCreation** — Creates event folders from template structure.

### Cross-Process Communication (Clippi)

Flippi monitors Project Clippi's OBS and Slippi connection status via a shared file:

- **Clippi writes** `%APPDATA%/Project Clippi/connection-status.json` (`{ obsConnected: bool, slippiConnected: bool, updatedAt: number }`) whenever its Redux store connection state changes. Uses atomic writes (`.tmp` + rename).
- **Flippi reads** this file every 3s in `startClippiProcessPolling()` (`src/main/main.ts`). If the process is running and the file is valid, connection values are patched into `statusStore`. If the process is not running, values are set to `null`.
- In dev mode, since Clippi runs under `node.exe`/`electron.exe` (not `Project Clippi.exe`), Flippi falls back to treating Clippi as running if the status file was updated within the last 30 seconds.
- `ClippiServiceStatus.obsConnected` / `slippiConnected` use three states: `true` (connected), `false` (explicitly disconnected), `null` (unknown/no data).

### Data Flow Patterns

**Status updates:** Services → `statusStore.patchStatus()` → main broadcasts `status:changed` via IPC → renderer `useServiceStatus()` hook re-renders UI

**Settings:** Renderer calls `flippiSettings.get()/update()` → main reads/writes via `electron-store` → if OBS settings changed, `obsConnectionManager.invalidateConnection()` is called

**Recording stack:** User triggers `flippiStack.start(eventName)` → main ensures folder exists, launches OBS if needed, connects WebSocket, configures recording output → status updates flow back to UI

### Renderer Structure

- `src/renderer/views/main/` — Page-level components (MainPanel with sidebar nav, RecordingPanel, SettingsPanel)
- `src/renderer/components/` — Reusable components (StatusBar, settings cards, SecretInput)
- `src/renderer/hooks/` — `useServiceStatus` (status subscription), `useSettings` (settings CRUD)

### Shared Types

`src/common/statusTypes.ts` — `ServiceStatus`, `ObsServiceStatus`, `ClippiServiceStatus`, `StackState` types shared between main and renderer processes.

### Settings Schema

Defined in `src/main/settings/schema.ts`, persisted via `electron-store`. Includes configs for OBS (host/port/password), YouTube (OAuth credentials), and AI providers (OpenAI/Gemini/Claude for text, OpenAI/Gemini for image).

## Build System

Webpack configs live in `.erb/configs/` with separate configurations for main, renderer, preload, and DLL builds. The DLL build pre-bundles renderer dependencies for faster dev rebuilds.

## Platform Notes

Windows-first (OBS/Clippi/Slippi process detection uses `tasklist`/`taskkill`). External process spawning in `src/main/utils/externalApps.ts` has cross-platform launch support but Windows-specific process management. Clippi connection status file path uses `process.env.APPDATA` (Windows-specific).
