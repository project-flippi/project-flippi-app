import { memo, useState } from 'react';
import type { CompilationEntry } from '../../../common/meleeTypes';
import { localImageUrl } from './GameCard';
import useAutoReset from '../../hooks/useAutoReset';

type Props = {
  compilation: CompilationEntry;
  eventName: string;
  onUpdated: () => void;
};

function CompilationCard({ compilation, eventName, onUpdated }: Props) {
  const [title, setTitle] = useState(compilation.title);
  const [description, setDescription] = useState(compilation.description);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const setStatusAuto = useAutoReset(setStatus, '', 3000);

  const fileName = compilation.filePath.split(/[\\/]/).pop() ?? '';

  async function saveFields() {
    setBusy(true);
    try {
      await window.flippiVideo.updateCompilation(
        eventName,
        compilation.filePath,
        { title, description },
      );
      setStatusAuto('Saved');
      onUpdated();
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function generateTitleAndDesc() {
    setBusy(true);
    setStatus('Generating title\u2026');
    try {
      const clipTitlesPrompt =
        compilation.clipTitles.length > 0
          ? compilation.clipTitles.join(', ')
          : 'Melee combo compilation';

      const titleRes = await window.flippiVideo.aiGenerateTitle(
        `Create a compilation title for these clips: ${clipTitlesPrompt}`,
        eventName,
      );
      if (titleRes.ok && titleRes.title) {
        setTitle(titleRes.title);

        setStatus('Generating description\u2026');
        const descRes = await window.flippiVideo.aiGenerateDesc(titleRes.title);
        if (descRes.ok && descRes.description) {
          setDescription(descRes.description);
        }

        await window.flippiVideo.updateCompilation(
          eventName,
          compilation.filePath,
          {
            title: titleRes.title,
            description: descRes.ok ? descRes.description : '',
          },
        );
        setStatusAuto('Generated');
        onUpdated();
      } else {
        setStatusAuto('Failed to generate');
      }
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function generateThumb() {
    if (!title) {
      setStatus('Set a title first');
      return;
    }
    setBusy(true);
    setStatus('Generating thumbnail\u2026');
    try {
      const res = await window.flippiVideo.aiGenerateThumbnail(title);
      if (res.ok && res.thumbnailPath) {
        await window.flippiVideo.updateCompilation(
          eventName,
          compilation.filePath,
          { thumbnail: res.thumbnailPath },
        );
        setStatusAuto('Thumbnail generated');
        onUpdated();
      } else {
        setStatusAuto('Failed to generate thumbnail');
      }
    } catch (err: any) {
      setStatusAuto(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-comp-card">
      <div className="pf-comp-card-header">
        <strong>{fileName}</strong>
        <span className="pf-status-message">
          {compilation.clipFiles.length} clips
        </span>
        {compilation.createdAt && (
          <span className="pf-status-message">
            {new Date(compilation.createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="pf-clip-card-fields">
        <div className="pf-field">
          <label htmlFor={`comp-title-${fileName}`}>
            Title
            <input
              id={`comp-title-${fileName}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Compilation title"
            />
          </label>
        </div>
        <div className="pf-field">
          <label htmlFor={`comp-desc-${fileName}`}>
            Description
            <input
              id={`comp-desc-${fileName}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="Compilation description"
            />
          </label>
        </div>
      </div>

      {compilation.thumbnail && (
        <div style={{ marginBottom: 8 }}>
          <img
            src={localImageUrl(compilation.thumbnail)}
            alt="Compilation thumbnail"
            style={{ maxWidth: 200, borderRadius: 6 }}
          />
        </div>
      )}

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
          onClick={generateTitleAndDesc}
          disabled={busy}
        >
          AI Title & Desc
        </button>
        <button
          type="button"
          className="pf-button"
          onClick={generateThumb}
          disabled={busy}
        >
          AI Thumbnail
        </button>
        {status && <span className="pf-status-message">{status}</span>}
      </div>
    </div>
  );
}

export default memo(CompilationCard);
