// ---------------------------------------------------------------------------
// Melee data types — shared between main process services and renderer
// ---------------------------------------------------------------------------

export interface PlayerInfo {
  playerIndex: number;
  port: number;
  characterId: number | null;
  characterColor: number | null;
  nametag: string;
  connectCode: string;
  displayName: string;
}

export interface ComboEvent {
  combo: {
    playerIndex: number;
    startFrame: number;
    endFrame: number;
    startPercent: number;
    endPercent: number;
    moves: { moveId: number; hitCount: number; damage: number }[];
    didKill: boolean;
  };
  settings: {
    stageId: number | null;
    players: PlayerInfo[];
  };
}

export interface ComboData {
  timestamp: string;
  trigger: string;
  source: string;
  phase: string;
  event: ComboEvent;
}

export interface VideoDataEntry {
  timestamp: string;
  filePath: string;
  title: string;
  prompt: string;
  description: string;
  nametag: string;
  stageId: number | null;
  stageName: string;
  attackerCharacterId: number | null;
  attackerCharacterName: string;
  attackerCharacterColor: number | null;
  attackerNametag: string;
  attackerConnectCode: string;
  attackerDisplayName: string;
  defenderCharacterId: number | null;
  defenderCharacterName: string;
  defenderCharacterColor: number | null;
  defenderNametag: string;
  defenderConnectCode: string;
  defenderDisplayName: string;
  combo: ComboEvent['combo'];
  phase: string;
  usedInCompilation: string;
  videoId: string;
  metadataFixed: boolean;
}

export interface CompilationEntry {
  filePath: string;
  title: string;
  description: string;
  clipTitles: string[];
  clipFiles: string[];
  thumbnail: string;
  createdAt: string;
}

export interface CompilationOptions {
  excludeUsed: boolean;
  maxClips: number;
  minClips: number;
}

// ---------------------------------------------------------------------------
// Parsed SLP game data types
// ---------------------------------------------------------------------------

/** Parsed player data from an SLP file */
export interface SlpPlayerData {
  playerIndex: number;
  port: number; // 1-4
  characterId: number | undefined;
  characterColor: number | undefined;
  nametag: string;
  connectCode: string;
  displayName: string;
  teamId: number | undefined;
  isWinner: boolean;
  placement: number | undefined;
}

export type MatchType = 'Singles' | 'Doubles' | 'Free for All' | 'Unknown';

export interface SlpGameData {
  players: SlpPlayerData[];
  stageId: number | undefined;
  matchType: MatchType;
  durationSeconds: number | null;
  gameComplete: boolean;
  lrasInitiatorIndex: number | undefined;
}

// ---------------------------------------------------------------------------
// Game video / SLP pairing types
// ---------------------------------------------------------------------------

/** A video file discovered in the event's videos/ directory */
export interface GameVideoFile {
  filePath: string;
  fileName: string;
  /** File creation time (birthtime) as ISO string — when OBS started writing */
  fileCreatedAt: string;
  fileSize: number;
}

/** An SLP replay file */
export interface SlpFileInfo {
  filePath: string;
  fileName: string;
  /** Timestamp parsed from filename (ISO string) — game start time */
  gameStartedAt: string;
  fileSize: number;
  /** File modification time in ms (stat.mtimeMs) — used for cache invalidation */
  fileMtime: number;
}

/** A game row: a video file optionally paired with its SLP source */
export interface GameEntry {
  video: GameVideoFile;
  slpFile: SlpFileInfo | null;
  slpGameData: SlpGameData | null;
}

export interface PairGamesResult {
  ok: boolean;
  totalVideos: number;
  paired: number;
  unmatched: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Set (tournament set) types
// ---------------------------------------------------------------------------

export type SetMatchType = 'Singles' | 'Doubles';

export type SetType = 'Tournament' | 'Friendlies' | 'Ranked' | 'Unranked';

export type SetPhase = 'Pools' | 'Winners' | 'Losers' | 'Grand';

export type SetRoundType = 'Round' | 'Quarters' | 'Semis' | 'Finals';

/** Override for a player's display name within a set */
export interface SetPlayerOverride {
  /** Which side: 0 or 1 (Singles), or 0-3 (Doubles) */
  side: number;
  /** Override display name (empty string = use SLP-derived name) */
  name: string;
}

/** Persisted set data (stored in sets.json) */
export interface GameSet {
  /** Unique identifier */
  id: string;
  /** Singles or Doubles */
  matchType: SetMatchType;
  /** Tournament, Friendlies, Ranked, or Unranked */
  setType: SetType;
  /** Tournament phase (only used when setType is Tournament) */
  phase: SetPhase;
  /** Round type: Round, Quarters, Semis, Finals */
  roundType: SetRoundType;
  /** Round number (only used when roundType is "Round") */
  roundNumber: string;
  /** Player name overrides indexed by side */
  playerOverrides: SetPlayerOverride[];
  /** Video file paths belonging to this set (sorted by filename) */
  gameVideoFilePaths: string[];
  /** Path to the compiled set video, if compiled */
  compiledVideoPath?: string | null;
  /** Path to the generated thumbnail image, if any */
  thumbnailPath?: string | null;
  /** ISO timestamp when created */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Thumbnail settings (per-event)
// ---------------------------------------------------------------------------

export interface EventThumbnailSettings {
  /** Path to event logo image (displayed below VS text) */
  eventLogoStampPath: string;
  /** Path to background image (overrides color backgrounds when set) */
  thumbnailCanvasPath: string;
  /** Hex color for text, default '#FFFFFF' */
  textColor: string;
  /** Hex color for left player background, default '#1a1a2e' */
  leftBgColor: string;
  /** Hex color for right player background, default '#16213e' */
  rightBgColor: string;
}

/** Runtime set entry returned to renderer (enriched with game data) */
export interface SetEntry {
  set: GameSet;
  /** Resolved game entries (populated at read time) */
  games: GameEntry[];
  /** Computed display title */
  title: string;
}

// ---------------------------------------------------------------------------
// Replay clips (from Clippi replay processor JSON)
// ---------------------------------------------------------------------------

/** A single queue entry from the replay processor JSON */
export interface ReplayProcessorQueueItem {
  /** Absolute SLP file path */
  path: string;
  /** Human-readable game start time */
  gameStartAt: string;
  /** Clip start frame (60fps, can be negative) */
  startFrame: number;
  /** Clip end frame (60fps) */
  endFrame: number;
}

/** Clippi replay processor JSON top-level structure */
export interface ReplayProcessorJson {
  mode: string;
  replay: string;
  isRealTimeMode: boolean;
  outputOverlayFiles: boolean;
  queue: ReplayProcessorQueueItem[];
}

/** A replay clip stored in the database */
export interface ReplayClip {
  id: string;
  /** JSON filename that was imported */
  importFile: string;
  /** SLP file path from the JSON */
  slpPath: string;
  /** Resolved video file path (null if no pairing found) */
  videoPath: string | null;
  startFrame: number;
  endFrame: number;
  /** Clamped start time in seconds: max(0, startFrame) / 60 */
  startSeconds: number;
  /** End time in seconds: endFrame / 60 */
  endSeconds: number;
  /** User-editable title (for YouTube) */
  title: string;
  /** User-editable description (for YouTube) */
  description: string;
  /** Path to created clip video file (null until created) */
  outputPath: string | null;
  /** Format of the created clip video ('standard' or 'portrait') */
  outputFormat: 'standard' | 'portrait' | null;
  /** Soft-delete: removed clips are excluded from batch creation */
  removed: boolean;
  createdAt: string;
}

/** Enriched replay clip with parsed SLP game data for display */
export interface ReplayClipEntry {
  clip: ReplayClip;
  slpGameData: SlpGameData | null;
}

// ---------------------------------------------------------------------------
// Clip compilations
// ---------------------------------------------------------------------------

/** A clip compilation stored in the database */
export interface ClipCompilation {
  id: string;
  title: string;
  description: string;
  /** Ordered clip IDs in this compilation */
  clipIds: string[];
  /** Path to compiled video file (null until compiled) */
  compiledVideoPath: string | null;
  createdAt: string;
}

/** Enriched compilation entry returned to the renderer */
export interface ClipCompilationEntry {
  compilation: ClipCompilation;
  /** Resolved clip entries (populated at read time) */
  clips: ReplayClipEntry[];
}
