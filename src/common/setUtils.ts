// ---------------------------------------------------------------------------
// Set utility functions — shared between main and renderer
// ---------------------------------------------------------------------------

/* eslint-disable no-plusplus */
import type { GameSet, GameEntry, SlpPlayerData } from './meleeTypes';
import { getCharacterName } from './meleeResources';

/**
 * Resolve the display name for a player side from SLP data across all games.
 * Priority: playerOverride > displayName > nametag > connectCode > "Player N"
 */
function resolvePlayerName(
  side: number,
  overrides: GameSet['playerOverrides'],
  players: SlpPlayerData[],
): string {
  const override = overrides.find((o) => o.side === side);
  if (override && override.name.trim()) return override.name.trim();

  const player = players[side];
  if (!player) return `Player ${side + 1}`;

  if (player.displayName) return player.displayName;
  if (player.nametag) return player.nametag;
  if (player.connectCode) return player.connectCode;
  return `Player ${side + 1}`;
}

/**
 * Deduplicate players by first occurrence key.
 */
function deduplicatePlayers(players: SlpPlayerData[]): SlpPlayerData[] {
  const seen = new Set<string>();
  return players.filter((p) => {
    const key = p.connectCode || p.displayName || p.nametag || `port${p.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Determine the "side" assignments for players across all games in a set.
 * The first game establishes the mapping. Returns an array of player arrays,
 * one per side, across all games.
 *
 * For Singles: 2 sides, 1 player each.
 * For Doubles: 2 sides, 2 players each (grouped by teamId).
 */
function getSidePlayersAcrossGames(
  games: GameEntry[],
  matchType: GameSet['matchType'],
): SlpPlayerData[][] {
  const gamesWithData = games.filter((g) => g.slpGameData);
  if (gamesWithData.length === 0) return [[], []];

  const firstGame = gamesWithData[0].slpGameData!;

  if (matchType === 'Doubles') {
    const teamIds = [...new Set(firstGame.players.map((p) => p.teamId))];
    const sides: SlpPlayerData[][] = [[], []];

    gamesWithData.forEach((game) => {
      const { players } = game.slpGameData!;
      Array.from({ length: Math.min(teamIds.length, 2) }).forEach(
        (_, sideIdx) => {
          const teamPlayers = players.filter(
            (p) => p.teamId === teamIds[sideIdx],
          );
          sides[sideIdx].push(...teamPlayers);
        },
      );
    });
    return sides;
  }

  // Singles: side 0 = first player, side 1 = second player
  const refPlayers = firstGame.players.slice(0, 2);
  const sides: SlpPlayerData[][] = [[], []];

  gamesWithData.forEach((game) => {
    const { players } = game.slpGameData!;
    const assigned = new Set<number>();

    Array.from({ length: Math.min(refPlayers.length, 2) }).forEach(
      (_, sideIdx) => {
        const ref = refPlayers[sideIdx];
        let match = players.find(
          (p, i) =>
            !assigned.has(i) &&
            ref.connectCode &&
            p.connectCode === ref.connectCode,
        );
        if (!match) {
          match = players.find(
            (p, i) =>
              !assigned.has(i) &&
              ref.displayName &&
              p.displayName === ref.displayName,
          );
        }
        if (!match) {
          match = players.find(
            (p, i) =>
              !assigned.has(i) && ref.nametag && p.nametag === ref.nametag,
          );
        }
        if (!match) {
          match = players.find(
            (p, i) => !assigned.has(i) && p.port === ref.port,
          );
        }
        if (match) {
          assigned.add(players.indexOf(match));
          sides[sideIdx].push(match);
        }
      },
    );
  });

  return sides;
}

/**
 * Get all unique characters played, ordered by frequency (most played first).
 * Returns a slash-separated string like "Fox/Falco" or "Fox".
 */
function playedCharacters(players: SlpPlayerData[]): string {
  const counts = new Map<number, number>();
  // Track first appearance order for stable tie-breaking
  const firstSeen = new Map<number, number>();
  let order = 0;
  players.forEach((p) => {
    if (p.characterId != null) {
      counts.set(p.characterId, (counts.get(p.characterId) ?? 0) + 1);
      if (!firstSeen.has(p.characterId)) {
        firstSeen.set(p.characterId, order);
        order += 1;
      }
    }
  });
  if (counts.size === 0) return '';

  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // most played first
    return (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0); // tie-break by first seen
  });

  return sorted.map(([id]) => getCharacterName(id)).join('/');
}

/**
 * Format the round display string from roundType + roundNumber.
 */
function formatRound(set: GameSet): string {
  if (set.roundType === 'Round') {
    return `Round ${set.roundNumber || '1'}`;
  }
  return set.roundType;
}

/**
 * Build the middle section of the title based on set type.
 *
 * Tournament: "Phase Round" (e.g. "Winners Semis")
 * Others: just the set type (e.g. "Friendlies", "Ranked", "Unranked")
 */
function formatContext(set: GameSet): string {
  if (set.setType === 'Tournament') {
    return `${set.phase} ${formatRound(set)}`;
  }
  return set.setType;
}

/**
 * Compute the display title for a set.
 *
 * Singles: "Player (Char) Vs. Player (Char) - Context - MELEE SINGLES | Event"
 * Doubles: "P1 & P2 Vs. P3 & P4 - Context - MELEE DOUBLES | Event"
 */
export function computeSetTitle(
  set: GameSet,
  games: GameEntry[],
  eventName: string,
): string {
  const sides = getSidePlayersAcrossGames(games, set.matchType);
  const context = formatContext(set);
  const matchLabel = `MELEE ${set.matchType.toUpperCase()}`;

  if (set.matchType === 'Doubles') {
    const sideNames = Array.from({ length: 2 }).map((_, sideIdx) => {
      const uniquePlayers = deduplicatePlayers(sides[sideIdx]);

      const names = Array.from({
        length: Math.min(uniquePlayers.length, 2),
      }).map((__, i) => {
        const overrideIdx = sideIdx * 2 + i;
        const override = set.playerOverrides.find(
          (o) => o.side === overrideIdx,
        );
        if (override && override.name.trim()) return override.name.trim();
        const p = uniquePlayers[i];
        return (
          p.displayName ||
          p.nametag ||
          p.connectCode ||
          `Player ${overrideIdx + 1}`
        );
      });

      if (names.length === 0) {
        return `Player ${sideIdx * 2 + 1} & Player ${sideIdx * 2 + 2}`;
      }
      return names.join(' & ');
    });

    return `${sideNames[0]} Vs. ${sideNames[1]} - ${context} - ${matchLabel} | ${eventName}`;
  }

  // Singles
  const playerParts = Array.from({ length: 2 }).map((_, sideIdx) => {
    const name = resolvePlayerName(
      sideIdx,
      set.playerOverrides,
      sides.map((s) => s[0]).filter(Boolean),
    );
    const char = playedCharacters(sides[sideIdx]);
    return char ? `${name} (${char})` : name;
  });

  return `${playerParts[0]} Vs. ${playerParts[1]} - ${context} - ${matchLabel} | ${eventName}`;
}

/**
 * Get the player names/identities resolved for a set (for display in override fields).
 * Returns an array of { side, resolvedName, port } entries.
 */
export function getResolvedPlayers(
  set: GameSet,
  games: GameEntry[],
): { side: number; resolvedName: string; port: number | undefined }[] {
  const sides = getSidePlayersAcrossGames(games, set.matchType);
  const result: {
    side: number;
    resolvedName: string;
    port: number | undefined;
  }[] = [];

  if (set.matchType === 'Doubles') {
    Array.from({ length: 2 }).forEach((_, sideIdx) => {
      const uniquePlayers = deduplicatePlayers(sides[sideIdx]);
      Array.from({ length: 2 }).forEach((__, i) => {
        const globalIdx = sideIdx * 2 + i;
        const p = uniquePlayers[i];
        result.push({
          side: globalIdx,
          resolvedName: p
            ? p.displayName ||
              p.nametag ||
              p.connectCode ||
              `Player ${globalIdx + 1}`
            : `Player ${globalIdx + 1}`,
          port: p?.port,
        });
      });
    });
  } else {
    Array.from({ length: 2 }).forEach((_, sideIdx) => {
      const p = sides[sideIdx][0];
      result.push({
        side: sideIdx,
        resolvedName: p
          ? p.displayName ||
            p.nametag ||
            p.connectCode ||
            `Player ${sideIdx + 1}`
          : `Player ${sideIdx + 1}`,
        port: p?.port,
      });
    });
  }

  return result;
}
