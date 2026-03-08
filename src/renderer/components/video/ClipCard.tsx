import { useState } from 'react';
import type {
  VideoDataEntry,
  CompilationEntry,
} from '../../../common/meleeTypes';
import PlayerInfo from './PlayerInfo';

type Props = {
  clip: VideoDataEntry;
  compilations: CompilationEntry[];
  eventName: string;
  onUpdated: () => void;
};

function ClipCard({ clip, compilations, eventName, onUpdated }: Props) {
  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const totalDamage = clip.combo
    ? (clip.combo.endPercent - clip.combo.startPercent).toFixed(1)
    : '?';
  const moveCount = clip.combo?.moves?.length ?? 0;
  const didKill = clip.combo?.didKill;

  async function saveFields() {
    setBusy(true);
    try {
      await window.flippiVideo.updateClip(eventName, clip.timestamp, {
        title,
        description,
      });
      setStatus('Saved');
      onUpdated();
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }

  async function generateTitle() {
    if (!clip.prompt) {
      setStatus('No prompt data available');
      return;
    }
    setBusy(true);
    setStatus('Generating title...');
    try {
      const res = await window.flippiVideo.aiGenerateTitle(
        clip.prompt,
        eventName,
      );
      if (res.ok && res.title) {
        setTitle(res.title);
        await window.flippiVideo.updateClip(eventName, clip.timestamp, {
          title: res.title,
        });
        setStatus('Title generated');
        onUpdated();
      } else {
        setStatus('Failed to generate title');
      }
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 3000);
    }
  }

  async function generateDesc() {
    if (!title) {
      setStatus('Set a title first');
      return;
    }
    setBusy(true);
    setStatus('Generating description...');
    try {
      const res = await window.flippiVideo.aiGenerateDesc(title);
      if (res.ok && res.description) {
        setDescription(res.description);
        await window.flippiVideo.updateClip(eventName, clip.timestamp, {
          description: res.description,
        });
        setStatus('Description generated');
        onUpdated();
      } else {
        setStatus('Failed to generate description');
      }
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 3000);
    }
  }

  async function onCompilationChange(value: string) {
    await window.flippiVideo.updateClip(eventName, clip.timestamp, {
      usedInCompilation: value,
    });
    onUpdated();
  }

  return (
    <div className="pf-clip-card">
      <div className="pf-clip-card-players">
        <PlayerInfo
          playerRole="Attacker"
          characterName={clip.attackerCharacterName}
          characterColor={clip.attackerCharacterColor}
          nametag={clip.attackerNametag}
          connectCode={clip.attackerConnectCode}
          displayName={clip.attackerDisplayName}
        />
        <PlayerInfo
          playerRole="Defender"
          characterName={clip.defenderCharacterName}
          characterColor={clip.defenderCharacterColor}
          nametag={clip.defenderNametag}
          connectCode={clip.defenderConnectCode}
          displayName={clip.defenderDisplayName}
        />
      </div>

      <div className="pf-combo-stats">
        <span>{clip.stageName}</span>
        <span>{totalDamage}% damage</span>
        <span>{moveCount} moves</span>
        {didKill && <span className="pf-ko-badge">KO</span>}
        {clip.phase && <span>Phase: {clip.phase}</span>}
      </div>

      <div className="pf-clip-card-fields">
        <div className="pf-field">
          <label htmlFor={`clip-title-${clip.timestamp}`}>
            Title
            <input
              id={`clip-title-${clip.timestamp}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Clip title"
            />
          </label>
        </div>
        <div className="pf-field">
          <label htmlFor={`clip-desc-${clip.timestamp}`}>
            Description
            <input
              id={`clip-desc-${clip.timestamp}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="Clip description"
            />
          </label>
        </div>
      </div>

      <div className="pf-clip-card-actions">
        <button
          type="button"
          className="pf-button pf-button-primary"
          onClick={saveFields}
          disabled={busy}
        >
          Save
        </button>
        <button
          type="button"
          className="pf-button"
          onClick={generateTitle}
          disabled={busy}
        >
          AI Title
        </button>
        <button
          type="button"
          className="pf-button"
          onClick={generateDesc}
          disabled={busy}
        >
          AI Desc
        </button>
        <select
          value={clip.usedInCompilation || ''}
          onChange={(e) => onCompilationChange(e.target.value)}
          disabled={busy}
          style={{ fontSize: '0.8rem' }}
        >
          <option value="">No compilation</option>
          {compilations.map((comp) => (
            <option key={comp.filePath} value={comp.filePath}>
              {comp.title || comp.filePath.split(/[\\/]/).pop()}
            </option>
          ))}
        </select>
        {status && <span className="pf-status-message">{status}</span>}
      </div>
    </div>
  );
}

export default ClipCard;
