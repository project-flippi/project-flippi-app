import { useState } from 'react';

type Props = {
  eventName: string;
  onCreated: () => void;
};

function CompilationFilterPanel({ eventName, onCreated }: Props) {
  const [excludeUsed, setExcludeUsed] = useState(true);
  const [maxClips, setMaxClips] = useState(20);
  const [minClips, setMinClips] = useState(3);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function handleCreate() {
    setBusy(true);
    setStatus('Creating compilation...');
    try {
      const res = await window.flippiVideo.createCompilation(eventName, {
        excludeUsed,
        maxClips,
        minClips,
      });
      setStatus(res.message);
      if (res.ok) onCreated();
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 5000);
    }
  }

  return (
    <div className="pf-filter-panel">
      <h3>Create Compilation</h3>
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.85rem',
          }}
        >
          <input
            type="checkbox"
            checked={excludeUsed}
            onChange={(e) => setExcludeUsed(e.target.checked)}
          />
          Exclude used clips
        </label>
        <label htmlFor="comp-min-clips" style={{ fontSize: '0.85rem' }}>
          Min clips
          <input
            id="comp-min-clips"
            type="number"
            value={minClips}
            onChange={(e) => setMinClips(Number(e.target.value))}
            min={1}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
        <label htmlFor="comp-max-clips" style={{ fontSize: '0.85rem' }}>
          Max clips
          <input
            id="comp-max-clips"
            type="number"
            value={maxClips}
            onChange={(e) => setMaxClips(Number(e.target.value))}
            min={1}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
        <button
          type="button"
          className="pf-button pf-button-primary"
          onClick={handleCreate}
          disabled={busy}
        >
          {busy ? 'Creating...' : 'Create'}
        </button>
        {status && <span className="pf-status-message">{status}</span>}
      </div>
    </div>
  );
}

export default CompilationFilterPanel;
