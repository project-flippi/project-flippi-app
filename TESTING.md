# Project Flippi v0.1.0 — Functionality Test Checklist

Run through this checklist on each test machine (Windows, macOS, Linux).

## Prerequisites
- OBS Studio installed with WebSocket server enabled (default port 4455)
- Project Clippi installed
- Slippi Launcher installed

---

## 1. Installation & Launch

- [ ] Installer runs without errors (.exe / .dmg / .AppImage)
- [ ] App opens to the Recording panel with sidebar visible
- [ ] Status bar visible at bottom with OBS, Clippi, and Slippi indicators (all gray)
- [ ] Window is resizable, minimum size enforced

## 2. Navigation

- [ ] Sidebar buttons switch between Recording, Video Management, Scheduling, Settings
- [ ] Active button is visually highlighted
- [ ] Video Management and Scheduling show placeholder text

## 3. Settings

- [ ] OBS card: Host, Port, and Password fields present (defaults: 127.0.0.1, 4455)
- [ ] YouTube card: Client ID, Project ID, Client Secret fields present
- [ ] Text AI card: Provider dropdown (OpenAI/Gemini/Claude) and API Key field
- [ ] Image AI card: Provider dropdown (OpenAI/Gemini) and API Key field
- [ ] Password fields toggle visibility with eye icon
- [ ] "Save Settings" disabled until a value is changed
- [ ] Change a value → Save → success message appears
- [ ] "Reset" reverts unsaved changes
- [ ] Settings persist after closing and reopening the app

## 4. Event Creation

- [ ] With no events, Recording panel shows "No event folders found" message
- [ ] Click "Create new event folder" → form appears with Title and Venue fields
- [ ] Submit with empty fields → validation error shown
- [ ] Fill in Title ("Test Event") and Venue ("Test Venue") → submit succeeds
- [ ] New event appears in dropdown and is auto-selected
- [ ] Verify folder created at `~/project-flippi/Event/Test-Event/` with subdirectories:
  `data/`, `images/`, `slp/`, `thumbnails/`, `videos/clips/`, `videos/compilations/`
- [ ] Creating a duplicate name shows "already exists" error
- [ ] Cancel button closes form without creating anything

## 5. Recording Stack — Start

- [ ] Select an event, click "Start Recording Stack"
- [ ] Button shows "Starting..." then changes to red "End Recording Stack"
- [ ] OBS launches (or connects to existing instance)
- [ ] Clippi launches (or detects existing instance)
- [ ] Slippi Launcher launches (or detects existing instance)
- [ ] Status bar: OBS indicator turns green ("Connected")
- [ ] Status bar: Clippi indicator turns green ("Fully connected") when OBS+Slippi connected
- [ ] Status bar: Slippi indicator turns green when Launcher + Dolphin detected
- [ ] Success toast appears when all three services are green

## 6. OBS Controls (while stack running)

- [ ] Game Capture Source dropdown lists OBS sources
- [ ] Selecting a source starts game capture monitoring (status bar shows monitoring state)
- [ ] With game content visible → game capture state turns green ("active")
- [ ] "Enable Replay Buffer" checkbox toggles OBS replay buffer immediately
- [ ] "Start Recording" checkbox toggles OBS recording immediately
- [ ] "Start Streaming" checkbox toggles OBS streaming immediately

## 7. Warning Boxes (while stack running)

- [ ] Kill OBS → warning box appears within ~3s: "OBS is not running"
- [ ] Click "Relaunch OBS" → OBS restarts, warning disappears, connection re-establishes
- [ ] Kill Clippi → warning box appears: "Project Clippi is not running"
- [ ] Click "Relaunch Clippi" → Clippi restarts, warning disappears
- [ ] Kill Slippi Launcher → warning box appears: "Slippi Launcher is not running"
- [ ] Click "Relaunch Slippi" → Slippi restarts
- [ ] If Clippi running but missing OBS/Slippi connection → info warning shown

## 8. Event Switching (while stack running)

- [ ] Select a different event from dropdown
- [ ] Button shows "Switching event..." briefly
- [ ] Status message confirms switch
- [ ] OBS recording output folder changes to new event's `videos/` directory

## 9. Recording Stack — Stop

- [ ] Click "End Recording Stack"
- [ ] Button shows "Stopping..." then returns to blue "Start Recording Stack"
- [ ] OBS recording/streaming/replay buffer stop
- [ ] OBS, Clippi, and Slippi processes are terminated
- [ ] Status bar indicators return to gray
- [ ] Status message: "Recording stack stopped"

## 10. Error Handling

- [ ] Start stack with wrong OBS password → status shows "Auth failed"
- [ ] Fix password in Settings, save → connection retries on next stack start
- [ ] Start stack with OBS not installed → stack start fails gracefully with error message
- [ ] Rapid start/stop clicks → no crashes, operations complete in order

## 11. Auto-Update

- [ ] On launch, app checks for updates (verify in logs or network tab)
- [ ] If a newer release exists, update notification appears

## 12. Platform-Specific Checks

### Windows
- [ ] Process detection works (OBS, Clippi, Slippi visible in task manager)
- [ ] Processes terminate cleanly on stack stop
- [ ] Event folders created under `C:\Users\{user}\project-flippi\Event\`

### macOS
- [ ] App bundle opens from `/Applications/` or mounted DMG
- [ ] Processes detected and terminated via `pgrep`/`pkill`
- [ ] Event folders created under `~/project-flippi/Event/`
- [ ] Unsigned app warning may appear (expected without code signing)

### Linux
- [ ] AppImage runs (may need `chmod +x` first)
- [ ] Processes detected and terminated via `pgrep`/`pkill`
- [ ] Event folders created under `~/project-flippi/Event/`

---

## Quick Smoke Test (5 minutes)

For a fast sanity check on a new machine:

1. Install and launch → app opens, no crashes
2. Go to Settings → enter OBS password → save
3. Create an event folder → verify it appears
4. Start recording stack → all three status indicators go green
5. Toggle recording on/off via checkbox
6. Stop recording stack → everything shuts down cleanly
