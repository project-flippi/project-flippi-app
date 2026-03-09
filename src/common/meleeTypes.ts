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
