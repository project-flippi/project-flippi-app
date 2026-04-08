import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ReplayClipEntry,
  ClipCompilationEntry,
} from '../../../common/meleeTypes';
import useAutoReset from '../../hooks/useAutoReset';
import useContainerHeight from '../../hooks/useContainerHeight';
import ReplayClipCard from './ReplayClipCard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { List } = require('react-window');

const CLIP_CARD_HEIGHT = 180;

interface ClipRowProps {
  entries: ReplayClipEntry[];
  eventName: string;
  selectedIds: Set<string>;
  onToggleSelect: (clipId: string) => void;
  onUpdated: () => void;
  clipCompilationMap: Map<string, string[]>;
}

function ClipRow({
  index,
  style,
  entries,
  eventName,
  selectedIds,
  onToggleSelect,
  onUpdated,
  clipCompilationMap,
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
        selected={selectedIds.has(entry.clip.id)}
        onToggleSelect={onToggleSelect}
        onUpdated={onUpdated}
        compilationNames={clipCompilationMap.get(entry.clip.id)}
      />
    </div>
  );
}

interface ReplayClipListProps {
  entries: ReplayClipEntry[];
  eventName: string;
  onReload: () => void;
  compilations: ClipCompilationEntry[];
  onCompilationChanged: () => void;
}

export default function ReplayClipList({
  entries,
  eventName,
  onReload,
  compilations,
  onCompilationChanged,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Clear stale selections when entries change
  useEffect(() => {
    setSelectedIds((prev) => {
      const entryIds = new Set(entries.map((e) => e.clip.id));
      const next = new Set([...prev].filter((id) => entryIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [entries]);

  const onToggleSelect = useCallback((clipId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === entries.length) {
        return new Set();
      }
      return new Set(entries.map((e) => e.clip.id));
    });
  }, [entries]);

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

  // Count selected clips that are eligible for video creation
  const selectedPendingCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          selectedIds.has(e.clip.id) &&
          !e.clip.removed &&
          !e.clip.outputPath &&
          e.clip.videoPath,
      ).length,
    [entries, selectedIds],
  );

  const handleCreateSelected = useCallback(async () => {
    const ids = [...selectedIds];
    setCreating(true);
    setProgress(null);
    try {
      const result = await window.flippiReplayClips.createVideos(
        eventName,
        ids,
      );
      setStatusAuto(
        `Created ${result.created} clips. ${result.skipped > 0 ? `${result.skipped} already existed.` : ''} ${result.failed > 0 ? `${result.failed} failed.` : ''}`.trim(),
      );
      setSelectedIds(new Set());
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Creation failed');
    } finally {
      setCreating(false);
      setProgress(null);
    }
  }, [eventName, selectedIds, onReload, setStatusAuto]);

  const handleCreatePortraitSelected = useCallback(async () => {
    const ids = [...selectedIds];
    setCreating(true);
    setProgress(null);
    try {
      const result = await window.flippiReplayClips.createPortraitVideos(
        eventName,
        ids,
      );
      setStatusAuto(
        `Created ${result.created} portrait clips. ${result.skipped > 0 ? `${result.skipped} already existed.` : ''} ${result.failed > 0 ? `${result.failed} failed.` : ''}`.trim(),
      );
      setSelectedIds(new Set());
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Portrait creation failed');
    } finally {
      setCreating(false);
      setProgress(null);
    }
  }, [eventName, selectedIds, onReload, setStatusAuto]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    setBulkBusy(true);
    try {
      const result = await window.flippiReplayClips.bulkDelete(eventName, ids);
      setStatusAuto(`Deleted ${result.deleted} clip(s)`);
      setSelectedIds(new Set());
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Delete failed');
    } finally {
      setBulkBusy(false);
    }
  }, [eventName, selectedIds, onReload, setStatusAuto]);

  // Count selected clips that have a created video
  const selectedWithVideoCount = useMemo(
    () =>
      entries.filter((e) => selectedIds.has(e.clip.id) && e.clip.outputPath)
        .length,
    [entries, selectedIds],
  );

  const handleBulkDeleteVideos = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => {
      const e = entries.find((en) => en.clip.id === id);
      return e?.clip.outputPath;
    });
    setBulkBusy(true);
    try {
      const result = await window.flippiReplayClips.bulkDeleteVideos(
        eventName,
        ids,
      );
      setStatusAuto(`Deleted ${result.deleted} clip video(s)`);
      setSelectedIds(new Set());
      onReload();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Delete failed');
    } finally {
      setBulkBusy(false);
    }
  }, [eventName, selectedIds, entries, onReload, setStatusAuto]);

  const anyBusy = importing || creating || bulkBusy;

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    'deleteVideos' | 'deleteClips' | null
  >(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Count selected clips that have a created video (eligible for compilation)
  const selectedCreatedCount = useMemo(
    () =>
      entries.filter((e) => selectedIds.has(e.clip.id) && e.clip.outputPath)
        .length,
    [entries, selectedIds],
  );

  // Compilation picker state
  const [compilationPickerOpen, setCompilationPickerOpen] = useState(false);

  const handleAddToNewCompilation = useCallback(async () => {
    const createdIds = entries
      .filter((e) => selectedIds.has(e.clip.id) && e.clip.outputPath)
      .map((e) => e.clip.id);
    if (createdIds.length === 0) return;
    setDropdownOpen(false);
    setCompilationPickerOpen(false);
    setBulkBusy(true);
    try {
      await window.flippiClipCompilations.create(eventName, '', createdIds);
      setStatusAuto(`Added ${createdIds.length} clip(s) to new compilation`);
      onCompilationChanged();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBulkBusy(false);
    }
  }, [entries, selectedIds, eventName, onCompilationChanged, setStatusAuto]);

  const handleAddToExistingCompilation = useCallback(
    async (compilationId: string) => {
      const createdIds = entries
        .filter((e) => selectedIds.has(e.clip.id) && e.clip.outputPath)
        .map((e) => e.clip.id);
      if (createdIds.length === 0) return;
      setDropdownOpen(false);
      setCompilationPickerOpen(false);
      setBulkBusy(true);
      try {
        await Promise.all(
          createdIds.map((clipId) =>
            window.flippiClipCompilations.addClip(
              eventName,
              compilationId,
              clipId,
            ),
          ),
        );
        setStatusAuto(`Added ${createdIds.length} clip(s) to compilation`);
        onCompilationChanged();
      } catch (err: any) {
        setStatusAuto(err?.message ?? 'Failed');
      } finally {
        setBulkBusy(false);
      }
    },
    [entries, selectedIds, eventName, onCompilationChanged, setStatusAuto],
  );

  // Build clip-to-compilation-names map
  const clipCompilationMap = useMemo(() => {
    const map = new Map<string, string[]>();
    compilations.forEach((ce) => {
      ce.compilation.clipIds.forEach((clipId) => {
        const names = map.get(clipId) ?? [];
        names.push(ce.compilation.title || 'Untitled');
        map.set(clipId, names);
      });
    });
    return map;
  }, [compilations]);

  const unresolvedCount = entries.filter(
    (e) => !e.clip.videoPath && !e.clip.removed,
  ).length;

  const rowProps: ClipRowProps = {
    entries,
    eventName,
    selectedIds,
    onToggleSelect,
    onUpdated: onReload,
    clipCompilationMap,
  };

  // Close dropdown on click-outside
  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
        setConfirmAction(null);
        setCompilationPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleDropdownAction = useCallback(
    (action: string) => {
      setDropdownOpen(false);
      setConfirmAction(null);
      if (action === 'create') {
        handleCreateSelected();
      } else if (action === 'createPortrait') {
        handleCreatePortraitSelected();
      }
    },
    [handleCreateSelected, handleCreatePortraitSelected],
  );

  const handleConfirmYes = useCallback(() => {
    const action = confirmAction;
    setConfirmAction(null);
    setDropdownOpen(false);
    if (action === 'deleteVideos') {
      handleBulkDeleteVideos();
    } else if (action === 'deleteClips') {
      handleBulkDelete();
    }
  }, [confirmAction, handleBulkDeleteVideos, handleBulkDelete]);

  return (
    <div className="pf-replay-clip-list">
      <div className="pf-replay-clip-toolbar">
        <button
          type="button"
          className="pf-button"
          onClick={handleImport}
          disabled={anyBusy}
        >
          {importing ? 'Importing...' : 'Import JSON'}
        </button>
        {entries.length > 0 && (
          <label className="pf-select-all-label" htmlFor="pf-select-all-clips">
            <input
              id="pf-select-all-clips"
              type="checkbox"
              checked={
                selectedIds.size > 0 && selectedIds.size === entries.length
              }
              ref={(el) => {
                if (el) {
                  el.indeterminate =
                    selectedIds.size > 0 && selectedIds.size < entries.length;
                }
              }}
              onChange={handleSelectAll}
            />
            Select All
          </label>
        )}
        {selectedIds.size > 0 && (
          <div className="pf-clip-action-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="pf-button pf-button-primary"
              onClick={() => {
                setDropdownOpen((prev) => !prev);
                setConfirmAction(null);
              }}
              disabled={anyBusy}
            >
              {creating
                ? `Creating${progress ? ` (${progress.current}/${progress.total})` : '...'}`
                : `Clip Actions (${selectedIds.size})`}
            </button>
            {dropdownOpen && !anyBusy && (
              <div className="pf-clip-action-menu">
                {confirmAction ? (
                  <div className="pf-clip-action-confirm">
                    <span className="pf-clip-action-confirm-prompt">
                      {confirmAction === 'deleteVideos'
                        ? `Delete ${selectedWithVideoCount} clip video(s)? Clip data will be kept.`
                        : `Delete ${selectedIds.size} clip(s) and their videos?`}
                    </span>
                    <div className="pf-clip-action-confirm-buttons">
                      <button
                        type="button"
                        className="pf-button pf-button-danger pf-button-sm"
                        onClick={handleConfirmYes}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="pf-button pf-button-sm"
                        onClick={() => setConfirmAction(null)}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {selectedPendingCount > 0 && (
                      <button
                        type="button"
                        className="pf-clip-action-item"
                        onClick={() => handleDropdownAction('create')}
                      >
                        Create Clip Videos ({selectedPendingCount})
                      </button>
                    )}
                    {selectedPendingCount > 0 && (
                      <button
                        type="button"
                        className="pf-clip-action-item"
                        onClick={() => handleDropdownAction('createPortrait')}
                      >
                        Create Portrait Clip Videos ({selectedPendingCount})
                      </button>
                    )}
                    {selectedCreatedCount > 0 && !compilationPickerOpen && (
                      <button
                        type="button"
                        className="pf-clip-action-item"
                        onClick={() => setCompilationPickerOpen(true)}
                      >
                        Add to Compilation ({selectedCreatedCount})
                      </button>
                    )}
                    {compilationPickerOpen && (
                      <div className="pf-compilation-picker">
                        <button
                          type="button"
                          className="pf-clip-action-item"
                          onClick={handleAddToNewCompilation}
                        >
                          + New Compilation
                        </button>
                        {compilations.map((ce) => (
                          <button
                            key={ce.compilation.id}
                            type="button"
                            className="pf-clip-action-item"
                            onClick={() =>
                              handleAddToExistingCompilation(ce.compilation.id)
                            }
                          >
                            {ce.compilation.title || 'Untitled'}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="pf-clip-action-item pf-text-muted"
                          onClick={() => setCompilationPickerOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {selectedWithVideoCount > 0 && (
                      <button
                        type="button"
                        className="pf-clip-action-item pf-clip-action-item--danger"
                        onClick={() => setConfirmAction('deleteVideos')}
                      >
                        Delete Clip Videos ({selectedWithVideoCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="pf-clip-action-item pf-clip-action-item--danger"
                      onClick={() => setConfirmAction('deleteClips')}
                    >
                      Delete Clips and Data ({selectedIds.size})
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
