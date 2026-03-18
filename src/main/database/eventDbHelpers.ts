// src/main/database/eventDbHelpers.ts
// Row mapping helpers for per-event SQLite database
import type {
  VideoDataEntry,
  CompilationEntry,
  GameSet,
} from '../../common/meleeTypes';

// ---------------------------------------------------------------------------
// Clips (VideoDataEntry)
// ---------------------------------------------------------------------------

export function rowToVideoDataEntry(row: any): VideoDataEntry {
  return {
    timestamp: row.timestamp,
    filePath: row.file_path,
    title: row.title,
    prompt: row.prompt,
    description: row.description,
    nametag: row.nametag,
    stageId: row.stage_id ?? null,
    stageName: row.stage_name,
    attackerCharacterId: row.attacker_character_id ?? null,
    attackerCharacterName: row.attacker_character_name,
    attackerCharacterColor: row.attacker_character_color ?? null,
    attackerNametag: row.attacker_nametag,
    attackerConnectCode: row.attacker_connect_code,
    attackerDisplayName: row.attacker_display_name,
    defenderCharacterId: row.defender_character_id ?? null,
    defenderCharacterName: row.defender_character_name,
    defenderCharacterColor: row.defender_character_color ?? null,
    defenderNametag: row.defender_nametag,
    defenderConnectCode: row.defender_connect_code,
    defenderDisplayName: row.defender_display_name,
    combo: JSON.parse(row.combo),
    phase: row.phase,
    usedInCompilation: row.used_in_compilation,
    videoId: row.video_id,
    metadataFixed: Boolean(row.metadata_fixed),
  };
}

export function videoDataEntryToParams(entry: VideoDataEntry): any[] {
  return [
    entry.timestamp,
    entry.filePath,
    entry.title,
    entry.prompt,
    entry.description,
    entry.nametag,
    entry.stageId,
    entry.stageName,
    entry.attackerCharacterId,
    entry.attackerCharacterName,
    entry.attackerCharacterColor,
    entry.attackerNametag,
    entry.attackerConnectCode,
    entry.attackerDisplayName,
    entry.defenderCharacterId,
    entry.defenderCharacterName,
    entry.defenderCharacterColor,
    entry.defenderNametag,
    entry.defenderConnectCode,
    entry.defenderDisplayName,
    JSON.stringify(entry.combo),
    entry.phase,
    entry.usedInCompilation,
    entry.videoId,
    entry.metadataFixed ? 1 : 0,
  ];
}

// ---------------------------------------------------------------------------
// Compilations
// ---------------------------------------------------------------------------

export function rowToCompilationEntry(row: any): CompilationEntry {
  return {
    filePath: row.file_path,
    title: row.title,
    description: row.description,
    clipTitles: JSON.parse(row.clip_titles),
    clipFiles: JSON.parse(row.clip_files),
    thumbnail: row.thumbnail,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export function rowToGameSet(row: any, gamePaths: string[]): GameSet {
  return {
    id: row.id,
    matchType: row.match_type,
    setType: row.set_type,
    phase: row.phase,
    roundType: row.round_type,
    roundNumber: row.round_number,
    playerOverrides: JSON.parse(row.player_overrides),
    gameVideoFilePaths: gamePaths,
    compiledVideoPath: row.compiled_video_path ?? null,
    createdAt: row.created_at,
  };
}
