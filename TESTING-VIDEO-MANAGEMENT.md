# Video Management & SLP Settings — Test Checklist

## Settings: SLP Data Folder

- [ ] Navigate to Settings tab
- [ ] SLP Data card appears in the settings grid
- [ ] Type a path manually into the SLP Data Folder input
- [ ] Click "Browse" — native folder picker dialog opens
- [ ] Select a folder — path populates in the input
- [ ] Cancel the dialog — input remains unchanged
- [ ] Click "Save Settings" — no errors
- [ ] Restart the app — SLP Data Folder value persists

## Video Management: Event Selection

- [ ] Navigate to Video Management tab
- [ ] Event dropdown populates with existing event folders
- [ ] Selecting a different event refreshes clips and compilations
- [ ] If no events exist, dropdown shows "No events"

## Video Management: Create Clip Data

- [ ] Select an event that has `combodata.jsonl` with entries
- [ ] Click "Create Clip Data" — status shows "Generating clip data..."
- [ ] Status updates with count of created entries
- [ ] Clips tab count updates in the tab label
- [ ] Click again — shows "All combos already processed" (no duplicates)
- [ ] Select an event with empty `combodata.jsonl` — shows "No combo data found"

## Video Management: Clips Tab

- [ ] Clips list renders after generating clip data
- [ ] Each clip card shows:
  - [ ] Attacker player info (character name, color, tag/connect code)
  - [ ] Defender player info (character name, color, tag/connect code)
  - [ ] Stage name
  - [ ] Damage percentage
  - [ ] Move count
  - [ ] KO badge (red) if combo killed
  - [ ] Phase label if present
- [ ] Title input is editable
- [ ] Description input is editable
- [ ] Click "Save" — status briefly shows "Saved"
- [ ] Compilation dropdown shows "No compilation" by default
- [ ] If compilations exist, they appear in the dropdown
- [ ] Selecting a compilation from dropdown assigns the clip

## Video Management: AI Title Generation (Clips)

- [ ] Configure a Text AI provider and API key in Settings first
- [ ] Click "AI Title" on a clip card
- [ ] Status shows "Generating title..."
- [ ] Title input populates with generated title
- [ ] Title is appended to `data/titlehistory.txt` in the event folder
- [ ] Generating again produces a different title (similarity dedup)
- [ ] With no API key configured — fails gracefully with error message

## Video Management: AI Description Generation (Clips)

- [ ] Set a title on a clip first
- [ ] Click "AI Desc" — status shows "Generating description..."
- [ ] Description input populates
- [ ] With no title set — shows "Set a title first"

## Video Management: Pair Video Files

- [ ] Place `.mp4` files in the event's `videos/clips/` directory
- [ ] Click "Pair Video Files"
- [ ] Status shows paired/unmatched counts
- [ ] Clip entries now have file paths populated in `videodata.jsonl`

## Video Management: Compilations Tab

- [ ] Switch to Compilations tab
- [ ] "Create Compilation" panel is visible with filter controls
- [ ] "Exclude used clips" checkbox defaults to checked
- [ ] Min clips defaults to 3, Max clips defaults to 20

## Video Management: Create Compilation

- [ ] Ensure enough clips exist (at least min clips with video files)
- [ ] Click "Create" — status shows "Creating compilation..."
- [ ] Success message shows clip count
- [ ] Compilation card appears in the list
- [ ] Compilation card shows:
  - [ ] File name
  - [ ] Clip count
  - [ ] Creation date
  - [ ] Editable title and description inputs
- [ ] Clips used are marked with `usedInCompilation` in videodata.jsonl
- [ ] Creating again with "Exclude used clips" checked skips already-used clips
- [ ] With fewer clips than minimum — shows error message

## Video Management: Compilation Metadata

- [ ] Edit compilation title and description
- [ ] Click "Save" — status shows "Saved"
- [ ] Click "AI Title & Desc" — generates both title and description
- [ ] Click "AI Thumbnail" (with title set) — generates thumbnail
- [ ] Thumbnail preview image appears if generated
- [ ] Without title — shows "Set a title first"

## Video Management: AI Provider Matrix

Test AI generation with each configured provider:

- [ ] OpenAI (gpt-4o-mini) — title generation works
- [ ] Claude (claude-haiku-4-5) — title generation works
- [ ] Gemini (gemini-2.0-flash) — title generation works
- [ ] OpenAI (DALL-E 3) — thumbnail generation works
- [ ] Gemini — thumbnail generation works

## Video Management: Refresh

- [ ] Click "Refresh" button — reloads clips and compilations
- [ ] Tab counts update after refresh
- [ ] Manually edit `videodata.jsonl` externally, click Refresh — changes appear

## Data Integrity

- [ ] `videodata.jsonl` — each line is valid JSON, entries have all expected fields
- [ ] `compdata.jsonl` — each line is valid JSON, entries reference real clip files
- [ ] `titlehistory.txt` — contains one title per line, no duplicates
- [ ] Atomic writes — check that `.tmp` files don't persist after writes

## Edge Cases

- [ ] Event with no `data/` directory — operations fail gracefully
- [ ] Very large `combodata.jsonl` (1000+ entries) — UI remains responsive
- [ ] Clips with null/missing character IDs — shows "Unknown" instead of crashing
- [ ] Clips with null stage ID — shows "Unknown Stage"
- [ ] Network error during AI generation — error message displayed, not a crash
- [ ] Rapid clicking action buttons — buttons disable during operations
- [ ] Switching events while an operation is in progress — no race conditions

## Cross-Platform (if applicable)

- [ ] Windows — folder picker uses native dialog
- [ ] macOS — folder picker uses native dialog
- [ ] File paths display correctly per platform (backslash vs forward slash)
