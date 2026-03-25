import React, { useCallback, useEffect, useState } from 'react';
import type { ReplayClipEntry } from '../../../common/meleeTypes';
import useAutoReset from '../../hooks/useAutoReset';
import useContainerHeight from '../../hooks/useContainerHeight';
import ReplayClipCard from './ReplayClipCard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { List } = require('react-window');

const CLIP_CARD_HEIGHT = 180;

interface ClipRowProps {
  entries: ReplayClipEntry[];
  eventName: string;
  onUpdated: () => void;
}

function ClipRow({
  index,
  style,
  entries,
  eventName,
  onUpdated,
}: {
  index: number;
  style: React.CSSProperties;
} & ClipRowProps) {
  const entry = entries[index];
  return (
    <div style={style}>
      <ReplayClipCard
        entry={entry}
        eventName={eventName}
        onUpdated={onUpdated}
      />
    </div>
  );
}

interface ReplayClipListProps {
  entries: ReplayClipEntry[];
  eventName: string;
  onReload: () => void;
}

export default function ReplayClipList({
  entries,
  eventName,
  onReload,
}: ReplayClipListProps) {
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const setStatusAuto = useAutoReset(setStatus, '', 5000);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const { containerRef, height: containerHeight } = useContainerHeight();

  // Subscribe to creation progress events
  useEffect(() => {
    const unsub = window.flippiReplayClips.onCreateProgress((_event, prog) => {
      if (prog.status === 'creating') {
        setProgress({ current: prog.current, total: prog.total });
      } else if (prog.status === 'error') {
        setProgress({ current: prog.current, total: prog.total });
      }
    });
    return unsub;
  }, []);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const fileResult = await window.flippiReplayClips.selectFile();
      if (!fileResult.ok) {
        setImporting(false);
        return;
      }

      const result = await window.flippiReplayClips.import(
        eventName,
        fileResult.filePath,
      );
      setStatusAuto(result.message);
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [eventName, onReload, setStatusAuto]);

  const handleCreateAll = useCallback(async () => {
    setCreating(true);
    setProgress(null);
    try {
      const result = await window.flippiReplayClips.createVideos(eventName);
      setStatusAuto(
        `Created ${result.created} clips. ${result.skipped > 0 ? `${result.skipped} already existed.` : ''} ${result.failed > 0 ? `${result.failed} failed.` : ''}`.trim(),
      );
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Creation failed');
    } finally {
      setCreating(false);
      setProgress(null);
    }
  }, [eventName, onReload, setStatusAuto]);

  const unresolvedCount = entries.filter(
    (e) => !e.clip.videoPath && !e.clip.removed,
  ).length;
  const pendingCount = entries.filter(
    (e) => !e.clip.removed && !e.clip.outputPath && e.clip.videoPath,
  ).length;

  const rowProps: ClipRowProps = { entries, eventName, onUpdated: onReload };

  return (
    <div className="pf-replay-clip-list">
      <div className="pf-replay-clip-toolbar">
        <button
          type="button"
          className="pf-button"
          onClick={handleImport}
          disabled={importing || creating}
        >
          {importing ? 'Importing...' : 'Import JSON'}
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            className="pf-button pf-button-primary"
            onClick={handleCreateAll}
            disabled={importing || creating}
          >
            {creating
              ? `Creating${progress ? ` (${progress.current}/${progress.total})` : '...'}`
              : `Create All Clip Videos (${pendingCount})`}
          </button>
        )}
        {unresolvedCount > 0 && (
          <span className="pf-warning-text">
            {unresolvedCount} clip{unresolvedCount !== 1 ? 's' : ''} missing
            paired video
          </span>
        )}
        {status && <span className="pf-status-message">{status}</span>}
      </div>

      {importing && (
        <div className="pf-status-message" style={{ padding: '8px 0' }}>
          Collecting clips&hellip;
        </div>
      )}

      <div className="pf-replay-clip-container" ref={containerRef}>
        {entries.length === 0 ? (
          <div className="pf-empty-state">
            No clips imported yet. Use &ldquo;Import JSON&rdquo; to load clips
            from a Clippi replay processor output file.
          </div>
        ) : (
          <List
            style={{ height: containerHeight }}
            rowComponent={ClipRow}
            rowCount={entries.length}
            rowHeight={CLIP_CARD_HEIGHT}
            rowProps={rowProps}
            overscanCount={3}
          />
        )}
      </div>
    </div>
  );
}
