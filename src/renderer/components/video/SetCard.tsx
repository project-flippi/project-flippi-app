import { useState } from 'react';
import type {
  SetEntry,
  SetPhase,
  SetType,
  SetRoundType,
} from '../../../common/meleeTypes';
import { getResolvedPlayers } from '../../../common/setUtils';
import GameMatchInfo from './GameMatchInfo';
import { VideoPlayerModal, localFileUrl, formatFileSize } from './GameCard';

const SET_TYPES: SetType[] = ['Tournament', 'Friendlies', 'Ranked', 'Unranked'];
const PHASES: SetPhase[] = ['Pools', 'Winners', 'Losers', 'Grand'];
const ROUND_TYPES: SetRoundType[] = ['Round', 'Quarters', 'Semis', 'Finals'];

interface SetCardProps {
  setEntry: SetEntry;
  eventName: string;
  onChanged: () => void;
}

function SetCard({ setEntry, eventName, onChanged }: SetCardProps) {
  const { set, games, title } = setEntry;
  const [showPlayer, setShowPlayer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resolvedPlayers = getResolvedPlayers(set, games);

  async function handleUpdate(updates: Record<string, any>) {
    setBusy(true);
    try {
      await window.flippiSets.update(eventName, set.id, updates);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const isTournament = set.setType === 'Tournament';

  async function handlePlayerOverride(side: number, name: string) {
    const overrides = [...set.playerOverrides];
    const existing = overrides.findIndex((o) => o.side === side);
    if (existing >= 0) {
      overrides[existing] = { side, name };
    } else {
      overrides.push({ side, name });
    }
    try {
      await window.flippiSets.update(eventName, set.id, {
        playerOverrides: overrides,
      });
      onChanged();
    } catch {
      // ignore
    }
  }

  async function handleRemoveGame(videoFilePath: string) {
    setBusy(true);
    try {
      await window.flippiSets.removeGame(eventName, set.id, videoFilePath);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSet() {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this set? Games will not be deleted.')) return;
    setBusy(true);
    try {
      await window.flippiSets.delete(eventName, set.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-set-card">
      {/* Title */}
      <div className="pf-set-title">{title}</div>

      {/* Editable metadata */}
      <div className="pf-set-meta">
        <select
          value={set.matchType}
          onChange={(e) => handleUpdate({ matchType: e.target.value })}
          disabled={busy}
        >
          <option value="Singles">Singles</option>
          <option value="Doubles">Doubles</option>
        </select>

        <select
          value={set.setType}
          onChange={(e) => handleUpdate({ setType: e.target.value })}
          disabled={busy}
        >
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {isTournament && (
          <>
            <select
              value={set.phase}
              onChange={(e) => handleUpdate({ phase: e.target.value })}
              disabled={busy}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={set.roundType}
              onChange={(e) => handleUpdate({ roundType: e.target.value })}
              disabled={busy}
            >
              {ROUND_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {set.roundType === 'Round' && (
              <input
                type="number"
                min="1"
                value={set.roundNumber}
                onChange={(e) => handleUpdate({ roundNumber: e.target.value })}
                disabled={busy}
                style={{ width: 60 }}
              />
            )}
          </>
        )}

        <button
          type="button"
          className="pf-button pf-button-danger"
          onClick={handleDeleteSet}
          disabled={busy}
          style={{
            marginLeft: 'auto',
            fontSize: '0.8rem',
            padding: '4px 10px',
          }}
        >
          Delete Set
        </button>
      </div>

      {/* Player overrides */}
      <div className="pf-set-player-overrides">
        {resolvedPlayers.map((rp) => {
          const override = set.playerOverrides.find((o) => o.side === rp.side);
          return (
            <div key={rp.side} className="pf-set-player-override">
              <label htmlFor={`set-${set.id}-p${rp.side}`}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  P{rp.side + 1}
                  {rp.port != null ? ` (Port ${rp.port})` : ''}
                </span>
                <input
                  id={`set-${set.id}-p${rp.side}`}
                  type="text"
                  defaultValue={override?.name ?? ''}
                  placeholder={rp.resolvedName}
                  onBlur={(e) => handlePlayerOverride(rp.side, e.target.value)}
                  style={{ width: 160, fontSize: '0.85rem' }}
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Games list */}
      <div className="pf-set-games">
        {games.length === 0 && (
          <div style={{ color: '#777', fontStyle: 'italic', padding: 8 }}>
            No games in this set
          </div>
        )}
        {games.map((game, idx) => (
          <div key={game.video.filePath} className="pf-set-game-card">
            <div style={{ flexShrink: 0, width: 140 }}>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="pf-video-thumbnail"
                onClick={() => setShowPlayer(game.video.filePath)}
              >
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={localFileUrl(game.video.filePath)}
                  preload="metadata"
                  style={{
                    width: 140,
                    borderRadius: 4,
                    backgroundColor: '#111',
                    display: 'block',
                  }}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration > 2) vid.currentTime = 2;
                  }}
                />
                <div
                  className="pf-video-play-icon"
                  style={{ fontSize: '1.2rem' }}
                >
                  &#9654;
                </div>
              </div>
              <div style={{ fontSize: '0.7em', color: '#999', marginTop: 2 }}>
                {game.video.fileName}
              </div>
              <div style={{ fontSize: '0.7em', color: '#777' }}>
                {formatFileSize(game.video.fileSize)}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#cbd5e1',
                  marginBottom: 4,
                }}
              >
                Game {idx + 1}
              </div>
              {game.slpGameData && (
                <GameMatchInfo slpGameData={game.slpGameData} />
              )}
              {!game.slpGameData && game.slpFile && (
                <div style={{ fontSize: '0.8em', color: '#999' }}>
                  {game.slpFile.fileName}
                </div>
              )}
              {!game.slpGameData && !game.slpFile && (
                <div
                  style={{
                    fontSize: '0.8em',
                    color: '#777',
                    fontStyle: 'italic',
                  }}
                >
                  No SLP data
                </div>
              )}
              {game.slpFile && (
                <div
                  style={{ fontSize: '0.7em', color: '#555', marginTop: 2 }}
                  title={game.slpFile.filePath}
                >
                  SLP: {game.slpFile.fileName}
                </div>
              )}
            </div>

            <button
              type="button"
              className="pf-set-remove-btn"
              onClick={() => handleRemoveGame(game.video.filePath)}
              disabled={busy}
              title="Remove from set"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Video player modal */}
      {showPlayer && (
        <VideoPlayerModal
          src={localFileUrl(showPlayer)}
          title={
            games.find((g) => g.video.filePath === showPlayer)?.video
              .fileName ?? ''
          }
          onClose={() => setShowPlayer(null)}
        />
      )}
    </div>
  );
}

export default SetCard;
