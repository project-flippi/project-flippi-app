import React, { useState } from 'react';
import type {
  SlpGameData,
  SetPhase,
  SetType,
  SetRoundType,
} from '../../../common/meleeTypes';

const SET_TYPES: SetType[] = ['Tournament', 'Friendlies', 'Ranked', 'Unranked'];
const PHASES: SetPhase[] = ['Pools', 'Winners', 'Losers', 'Grand'];
const ROUND_TYPES: SetRoundType[] = ['Round', 'Quarters', 'Semis', 'Finals'];

interface NewSetFormProps {
  eventName: string;
  videoFilePath: string;
  slpGameData: SlpGameData | null;
  onCreated: () => void;
  onCancel: () => void;
}

function NewSetForm({
  eventName,
  videoFilePath,
  slpGameData,
  onCreated,
  onCancel,
}: NewSetFormProps) {
  const isSingles = !slpGameData || slpGameData.matchType !== 'Doubles';
  const playerCount = isSingles ? 2 : 4;

  const [matchType, setMatchType] = useState<'Singles' | 'Doubles'>(
    isSingles ? 'Singles' : 'Doubles',
  );
  const [setType, setSetType] = useState<SetType>('Tournament');
  const [phase, setPhase] = useState<SetPhase>('Winners');
  const [roundType, setRoundType] = useState<SetRoundType>('Round');
  const [roundNumber, setRoundNumber] = useState('1');
  const [playerNames, setPlayerNames] = useState<string[]>(
    Array(playerCount).fill(''),
  );
  const [busy, setBusy] = useState(false);

  const isTournament = setType === 'Tournament';

  // Derive placeholder names from SLP data
  const placeholders = Array.from({ length: playerCount }, (_, i) => {
    if (slpGameData) {
      const p = slpGameData.players[i];
      if (p) {
        return p.displayName || p.nametag || p.connectCode || `Player ${i + 1}`;
      }
    }
    return `Player ${i + 1}`;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const overrides = playerNames.map((name, idx) => ({
        side: idx,
        name: name.trim(),
      }));
      await window.flippiSets.create(
        eventName,
        matchType,
        setType,
        phase,
        roundType,
        roundType === 'Round' ? roundNumber.trim() || '1' : '',
        overrides,
        videoFilePath,
      );
      onCreated();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err?.message ?? 'Failed to create set');
    } finally {
      setBusy(false);
    }
  }

  function updatePlayerName(idx: number, value: string) {
    setPlayerNames((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function handleMatchTypeChange(val: 'Singles' | 'Doubles') {
    setMatchType(val);
    const count = val === 'Doubles' ? 4 : 2;
    setPlayerNames((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] ?? ''),
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="pf-video-modal-overlay" onClick={onCancel}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="pf-new-set-form" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px' }}>New Set</h3>
        <form onSubmit={handleSubmit}>
          <div className="pf-field">
            <label htmlFor="set-match-type">
              Match Type
              <select
                id="set-match-type"
                value={matchType}
                onChange={(e) =>
                  handleMatchTypeChange(e.target.value as 'Singles' | 'Doubles')
                }
              >
                <option value="Singles">Singles</option>
                <option value="Doubles">Doubles</option>
              </select>
            </label>
          </div>

          <div className="pf-field">
            <label htmlFor="set-set-type">
              Type
              <select
                id="set-set-type"
                value={setType}
                onChange={(e) => setSetType(e.target.value as SetType)}
              >
                {SET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isTournament && (
            <>
              <div className="pf-field">
                <label htmlFor="set-phase">
                  Phase
                  <select
                    id="set-phase"
                    value={phase}
                    onChange={(e) => setPhase(e.target.value as SetPhase)}
                  >
                    {PHASES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pf-field">
                <label htmlFor="set-round-type">
                  Round
                  <div
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                    <select
                      id="set-round-type"
                      value={roundType}
                      onChange={(e) =>
                        setRoundType(e.target.value as SetRoundType)
                      }
                    >
                      {ROUND_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {roundType === 'Round' && (
                      <input
                        id="set-round-number"
                        type="number"
                        min="1"
                        value={roundNumber}
                        onChange={(e) => setRoundNumber(e.target.value)}
                        style={{ width: 60 }}
                      />
                    )}
                  </div>
                </label>
              </div>
            </>
          )}

          <div
            style={{
              marginTop: 12,
              marginBottom: 8,
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Player Name Overrides
            <span
              style={{
                fontWeight: 400,
                color: '#9ca3af',
                fontSize: '0.8rem',
                marginLeft: 8,
              }}
            >
              (leave blank to use SLP data)
            </span>
          </div>

          {Array.from({ length: matchType === 'Doubles' ? 4 : 2 }).map(
            (_, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="pf-field" key={`player-side-${idx}`}>
                <label htmlFor={`set-player-${idx}`}>
                  Player {idx + 1}
                  <input
                    id={`set-player-${idx}`}
                    type="text"
                    value={playerNames[idx] ?? ''}
                    onChange={(e) => updatePlayerName(idx, e.target.value)}
                    placeholder={placeholders[idx] ?? `Player ${idx + 1}`}
                    style={{ minWidth: 200 }}
                  />
                </label>
              </div>
            ),
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="submit"
              className="pf-button pf-button-primary"
              disabled={busy}
            >
              {busy ? 'Creating...' : 'Create Set'}
            </button>
            <button
              type="button"
              className="pf-button"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewSetForm;
