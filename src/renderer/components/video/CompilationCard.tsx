import { useState } from 'react';
import type { CompilationEntry } from '../../../common/meleeTypes';

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

  const fileName = compilation.filePath.split(/[\\/]/).pop() ?? '';

  async function saveFields() {
    setBusy(true);
    try {
      await window.flippiVideo.updateCompilation(
        eventName,
        compilation.filePath,
        { title, description },
      );
      setStatus('Saved');
      onUpdated();
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }

  async function generateTitleAndDesc() {
    setBusy(true);
    setStatus('Generating title...');
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

        setStatus('Generating description...');
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
        setStatus('Generated');
        onUpdated();
      } else {
        setStatus('Failed to generate');
      }
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 3000);
    }
  }

  async function generateThumb() {
    if (!title) {
      setStatus('Set a title first');
      return;
    }
    setBusy(true);
    setStatus('Generating thumbnail...');
    try {
      const res = await window.flippiVideo.aiGenerateThumbnail(title);
      if (res.ok && res.thumbnailPath) {
        await window.flippiVideo.updateCompilation(
          eventName,
          compilation.filePath,
          { thumbnail: res.thumbnailPath },
        );
        setStatus('Thumbnail generated');
        onUpdated();
      } else {
        setStatus('Failed to generate thumbnail');
      }
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 3000);
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
            src={`file://${compilation.thumbnail}`}
            alt="Thumbnail"
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

export default CompilationCard;
