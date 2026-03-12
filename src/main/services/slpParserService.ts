// src/main/services/slpParserService.ts
// Parses SLP replay files using @slippi/slippi-js to extract game data
import log from 'electron-log';
import type {
  SlpGameData,
  SlpPlayerData,
  MatchType,
} from '../../common/meleeTypes';

/**
 * Parse an SLP file and return structured game data.
 * Returns null if the file cannot be parsed.
 */
export function parseSlpFile(filePath: string): SlpGameData | null {
  try {
    // Must use /node subpath for file-based parsing in Electron main process
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const { SlippiGame } = require('@slippi/slippi-js/node');

    const game = new SlippiGame(filePath);
    const settings = game.getSettings();
    if (!settings) return null;

    const metadata = game.getMetadata();
    const gameEnd = game.getGameEnd();

    // Duration from metadata lastFrame (60 fps)
    const durationSeconds =
      metadata?.lastFrame != null ? Math.round(metadata.lastFrame / 60) : null;

    // Build placements map from gameEnd
    const placementMap = new Map<number, number>();
    if (gameEnd?.placements) {
      (gameEnd.placements as any[]).forEach(
        (p: { playerIndex: number; position: number }) => {
          placementMap.set(p.playerIndex, p.position);
        },
      );
    }

    // Filter to active players (those with a valid characterId)
    const activePlayers = (settings.players || []).filter(
      (p: any) => p.characterId != null && p.characterId >= 0,
    );

    // Determine match type
    let matchType: MatchType = 'Unknown';
    if (settings.isTeams) {
      matchType = 'Doubles';
    } else if (activePlayers.length === 2) {
      matchType = 'Singles';
    } else if (activePlayers.length >= 3) {
      matchType = 'Free for All';
    }

    // Build player data
    const players: SlpPlayerData[] = activePlayers.map((p: any) => {
      const placement = placementMap.get(p.playerIndex);
      return {
        playerIndex: p.playerIndex,
        port: p.port,
        characterId: p.characterId ?? undefined,
        characterColor: p.characterColor ?? undefined,
        nametag: p.nametag || '',
        connectCode: p.connectCode || '',
        displayName: p.displayName || '',
        teamId: p.teamId ?? undefined,
        isWinner: placement === 0,
        placement: placement ?? undefined,
      };
    });

    return {
      players,
      stageId: settings.stageId ?? undefined,
      matchType,
      durationSeconds,
      gameComplete: gameEnd != null,
      lrasInitiatorIndex: gameEnd?.lrasInitiatorIndex ?? undefined,
    };
  } catch (err: any) {
    log.warn(`[slpParser] Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Yield to the event loop so the main process stays responsive
 * during batch SLP parsing.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Parse an SLP file asynchronously, yielding to the event loop
 * so the main process isn't blocked during batch operations.
 */
export async function parseSlpFileAsync(
  filePath: string,
): Promise<SlpGameData | null> {
  await yieldToEventLoop();
  return parseSlpFile(filePath);
}
