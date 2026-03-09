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
}

/** A game row: a video file optionally paired with its SLP source */
export interface GameEntry {
  video: GameVideoFile;
  slpFile: SlpFileInfo | null;
}

export interface PairGamesResult {
  ok: boolean;
  totalVideos: number;
  paired: number;
  unmatched: number;
  message: string;
}
