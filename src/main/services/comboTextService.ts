// src/main/services/comboTextService.ts
// Generate a plain-language description of the longest combo/punish that
// occurred within a clip's frame range. Used to seed AI title/description
// generation for replay clips.
//
// The generated text follows the template originally implemented in
// project-flippi-python/ProcessComboTextFile.py, e.g.
//   "On Final Destination, Mang0's Falco punished Hungrybox's Jigglypuff.
//    Damage dealt: ~58%. Sequence: Blaster, Down Air → Finisher: Up Smash.
//    Did KO: true. Opening: neutral-win."
import log from 'electron-log';
import characterMoveNames from '../../common/characterMoveNames';

// ---------------------------------------------------------------------------
// Move name resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a move ID to a display name. Prefers the character-specific flair
 * name from the ported Python dict, falls back to slippi-js's generic name.
 */
function resolveMoveName(attackerCharName: string, moveId: number): string {
  const charMoves = characterMoveNames[attackerCharName];
  if (charMoves && charMoves[moveId]) {
    return charMoves[moveId];
  }
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { moves } = require('@slippi/slippi-js/node');
  const name = moves.getMoveName(moveId);
  return name || 'move';
}

/**
 * Resolve a human-readable name for a player. Preference order:
 *   1. Slippi netplay display name (from metadata)
 *   2. settings.players[i].displayName
 *   3. connectCode
 *   4. nametag
 *   5. "Player N" fallback
 */
function resolvePlayerName(player: any, metadata: any): string {
  const netplay = metadata?.players?.[player.playerIndex]?.names?.netplay;
  if (netplay && netplay.trim()) return netplay.trim();
  if (player.displayName && player.displayName.trim()) {
    return player.displayName.trim();
  }
  if (player.connectCode && player.connectCode.trim()) {
    return player.connectCode.trim();
  }
  if (player.nametag && player.nametag.trim()) return player.nametag.trim();
  return `Player ${player.playerIndex + 1}`;
}

// ---------------------------------------------------------------------------
// Formatter — pure, testable
// ---------------------------------------------------------------------------

/** Input shape for formatComboText — minimal subset of slippi-js types. */
export interface FormatComboTextInput {
  stageName: string;
  attackerName: string;
  attackerCharName: string;
  defenderName: string;
  defenderCharName: string;
  /** Ordered move IDs landed during the conversion. */
  moveIds: number[];
  startPercent: number;
  /** Final percent on the defender at the end of the conversion. */
  endPercent: number;
  didKill: boolean;
  /**
   * ConversionType.openingType from slippi-js — typically one of
   * "neutral-win", "counter-attack", "trade", or "unknown".
   */
  openingType?: string;
}

/**
 * Build a plain-language description of a single combo / punish.
 * Exported for unit tests.
 */
export function formatComboText(input: FormatComboTextInput): string {
  const {
    stageName,
    attackerName,
    attackerCharName,
    defenderName,
    defenderCharName,
    moveIds,
    startPercent,
    endPercent,
    didKill,
    openingType,
  } = input;

  const percent = Math.round(endPercent - startPercent);
  const moveNames = moveIds.map((id) => resolveMoveName(attackerCharName, id));

  const parts: string[] = [
    `On ${stageName}, ${attackerName}'s ${attackerCharName} punished ${defenderName}'s ${defenderCharName}.`,
    `Damage dealt: ~${percent}%.`,
  ];

  if (moveNames.length >= 2) {
    const sequence = moveNames.slice(0, -1).join(', ');
    const finisher = moveNames[moveNames.length - 1];
    parts.push(`Sequence: ${sequence} → Finisher: ${finisher}.`);
  } else if (moveNames.length === 1) {
    parts.push(`Finisher: ${moveNames[0]}.`);
  }

  parts.push(`Did KO: ${didKill ? 'true' : 'false'}.`);
  if (openingType) {
    parts.push(`Opening: ${openingType}.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// generateComboText — SLP → formatted text
// ---------------------------------------------------------------------------

interface RawConversion {
  playerIndex: number;
  startFrame: number;
  endFrame: number | undefined;
  startPercent: number;
  endPercent: number | undefined;
  currentPercent: number;
  didKill: boolean;
  moves: { moveId: number }[];
  openingType?: string;
}

/**
 * Parse an SLP file, locate the longest conversion that overlaps the given
 * frame range, and return a plain-language description of it.
 *
 * Returns `null` when:
 *   - the SLP file cannot be parsed
 *   - the match is not singles (doubles/FFA are unsupported)
 *   - no conversion overlaps the clip's frame range
 *   - any other error (logged and swallowed)
 */
export async function generateComboText(
  slpPath: string,
  startFrame: number,
  endFrame: number,
): Promise<string | null> {
  try {
    // Must use /node subpath for file-based parsing in Electron main process
    const {
      SlippiGame,
      characters,
      stages,
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    } = require('@slippi/slippi-js/node');

    const game = new SlippiGame(slpPath);
    const settings = game.getSettings();
    if (!settings) return null;

    // Only singles are supported — doubles/FFA don't produce usable combo data
    if (settings.isTeams) return null;
    const activePlayers = (settings.players || []).filter(
      (p: any) => p.characterId != null && p.characterId >= 0,
    );
    if (activePlayers.length !== 2) return null;

    const stats = game.getStats();
    const conversions: RawConversion[] = stats?.conversions ?? [];
    if (conversions.length === 0) return null;

    // Pick the longest conversion whose frame range overlaps the clip window.
    // Treat an undefined endFrame as "runs to end of game".
    const overlapping = conversions.filter((c) => {
      const cEnd = c.endFrame ?? Number.POSITIVE_INFINITY;
      return cEnd >= startFrame && c.startFrame <= endFrame;
    });
    if (overlapping.length === 0) return null;

    let best: RawConversion | null = null;
    let bestDuration = -1;
    let bestDamage = -Infinity;
    overlapping.forEach((c) => {
      const cEnd = c.endFrame ?? c.startFrame;
      const duration = cEnd - c.startFrame;
      const damage =
        (c.endPercent ?? c.currentPercent ?? 0) - (c.startPercent ?? 0);
      if (
        duration > bestDuration ||
        (duration === bestDuration && damage > bestDamage)
      ) {
        best = c;
        bestDuration = duration;
        bestDamage = damage;
      }
    });
    if (!best) return null;

    // Reassign through a local `const` so TS narrows the type from the
    // mutated `best` above. (TS widens to RawConversion | null after the
    // forEach mutation, even though we just guarded against null.)
    const conv: RawConversion = best;

    const attacker = settings.players.find(
      (p: any) => p.playerIndex === conv.playerIndex,
    );
    const defender = settings.players.find(
      (p: any) =>
        p.playerIndex !== conv.playerIndex &&
        p.characterId != null &&
        p.characterId >= 0,
    );
    if (!attacker || !defender) return null;

    const metadata = game.getMetadata();

    const stageName =
      settings.stageId != null
        ? stages.getStageName(settings.stageId)
        : 'Unknown Stage';
    const attackerCharName = characters.getCharacterName(attacker.characterId);
    const defenderCharName = characters.getCharacterName(defender.characterId);
    const attackerName = resolvePlayerName(attacker, metadata);
    const defenderName = resolvePlayerName(defender, metadata);

    return formatComboText({
      stageName,
      attackerName,
      attackerCharName,
      defenderName,
      defenderCharName,
      moveIds: conv.moves.map((m) => m.moveId),
      startPercent: conv.startPercent ?? 0,
      endPercent: conv.endPercent ?? conv.currentPercent ?? 0,
      didKill: Boolean(conv.didKill),
      openingType: conv.openingType,
    });
  } catch (err: any) {
    log.warn(
      `[comboText] Failed to generate combo text for ${slpPath}: ${err.message}`,
    );
    return null;
  }
}
