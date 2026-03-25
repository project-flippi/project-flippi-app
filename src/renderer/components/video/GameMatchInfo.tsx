/* eslint-disable import/no-self-import, import/no-useless-path-segments */
import React from 'react';
import type { SlpGameData } from '../../../common/meleeTypes';
import { portColors } from '../../../common/meleeResources';

// Webpack require.context typings
type WebpackRequireContext = ((key: string) => string) & {
  keys(): string[];
};

// Build a require.context for stock icons so webpack bundles them
let stockIconContext: WebpackRequireContext | null = null;
try {
  stockIconContext = (require as any).context(
    '../../../../assets/stock-icons',
    true,
    /stock\.png$/,
  );
} catch {
  // stock-icons directory may not exist yet
}

let unknownIcon: string = '';
try {
  // eslint-disable-next-line global-require
  unknownIcon = require('../../../../assets/stock-icons/unknown.png');
} catch {
  // fallback not available
}

function getStockIconPath(
  characterId: number | undefined,
  color: number | undefined,
): string {
  if (characterId == null || !stockIconContext) return unknownIcon;
  const c = color ?? 0;
  const key = `./${characterId}/${c}/stock.png`;
  try {
    return stockIconContext(key);
  } catch {
    return unknownIcon;
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getPlayerIdentity(player: {
  displayName: string;
  connectCode: string;
  nametag: string;
  port: number;
}): { primary: string; secondary: string } {
  if (player.displayName) {
    return {
      primary: player.displayName,
      secondary: player.connectCode || '',
    };
  }
  if (player.connectCode) {
    return { primary: player.connectCode, secondary: '' };
  }
  if (player.nametag) {
    return { primary: player.nametag, secondary: '' };
  }
  return { primary: `Player ${player.port}`, secondary: '' };
}

interface GameMatchInfoProps {
  slpGameData: SlpGameData;
  hideWinner?: boolean;
}

function GameMatchInfo({
  slpGameData,
  hideWinner = false,
}: GameMatchInfoProps) {
  const { players } = slpGameData;

  return (
    <div className="pf-match-players-row">
      {players.map((player, idx) => {
        const identity = getPlayerIdentity(player);
        const iconSrc = getStockIconPath(
          player.characterId,
          player.characterColor,
        );

        return (
          <React.Fragment key={player.playerIndex}>
            {idx > 0 && <span className="pf-player-separator">|</span>}
            <div className="pf-match-player">
              <span
                className="pf-port-indicator"
                style={{ color: portColors[player.port] || '#999' }}
              >
                P{player.port}
              </span>
              {iconSrc && (
                <img className="pf-stock-icon" src={iconSrc} alt="" />
              )}
              <span className="pf-player-identity">{identity.primary}</span>
              {identity.secondary && (
                <span className="pf-player-code">({identity.secondary})</span>
              )}
              {!hideWinner && player.isWinner && (
                <span className="pf-winner-badge">W</span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default React.memo(GameMatchInfo);
