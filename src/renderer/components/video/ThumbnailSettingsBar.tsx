import React, { useCallback, useEffect, useState } from 'react';
import type { EventThumbnailSettings } from '../../../common/meleeTypes';

interface ThumbnailSettingsBarProps {
  eventName: string;
}

function ThumbnailSettingsBar({ eventName }: ThumbnailSettingsBarProps) {
  const [settings, setSettings] = useState<EventThumbnailSettings | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!eventName) return;
    try {
      const s = await window.flippiThumbnail.getSettings(eventName);
      setSettings(s);
    } catch {
      setSettings(null);
    }
  }, [eventName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback(
    async (updates: Partial<EventThumbnailSettings>) => {
      if (!eventName) return;
      try {
        const updated = await window.flippiThumbnail.updateSettings(
          eventName,
          updates,
        );
        setSettings(updated);
      } catch {
        // ignore
      }
    },
    [eventName],
  );

  const handleSelectImage = useCallback(
    async (purpose: 'logo' | 'canvas') => {
      if (!eventName) return;
      const result = await window.flippiThumbnail.selectImage(
        eventName,
        purpose,
      );
      if (result.ok) {
        // Settings are updated server-side; reload
        loadSettings();
      }
    },
    [eventName, loadSettings],
  );

  const handleClearImage = useCallback(
    async (purpose: 'logo' | 'canvas') => {
      const key =
        purpose === 'logo' ? 'eventLogoStampPath' : 'thumbnailCanvasPath';
      await updateSetting({ [key]: '' });
    },
    [updateSetting],
  );

  if (!settings || !eventName) return null;

  const logoName = settings.eventLogoStampPath
    ? settings.eventLogoStampPath.split(/[\\/]/).pop()
    : '';
  const canvasName = settings.thumbnailCanvasPath
    ? settings.thumbnailCanvasPath.split(/[\\/]/).pop()
    : '';

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--pf-text-muted)',
          cursor: 'pointer',
          fontSize: '0.85rem',
          padding: '4px 0',
        }}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Thumbnail settings"
      >
        {expanded ? '\u25BC' : '\u25B6'} Thumbnail Settings
      </button>

      {expanded && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            padding: '8px 0',
            fontSize: '0.85rem',
          }}
        >
          {/* Event Logo Stamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--pf-text-muted)' }}>Logo:</span>
            <button
              type="button"
              className="pf-button"
              style={{ fontSize: '0.8rem', padding: '2px 8px' }}
              onClick={() => handleSelectImage('logo')}
            >
              {logoName || 'None'}
            </button>
            {logoName && (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pf-danger-light)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
                onClick={() => handleClearImage('logo')}
                aria-label="Clear logo"
              >
                x
              </button>
            )}
          </div>

          {/* Thumbnail Canvas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--pf-text-muted)' }}>Canvas:</span>
            <button
              type="button"
              className="pf-button"
              style={{ fontSize: '0.8rem', padding: '2px 8px' }}
              onClick={() => handleSelectImage('canvas')}
            >
              {canvasName || 'None'}
            </button>
            {canvasName && (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pf-danger-light)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
                onClick={() => handleClearImage('canvas')}
                aria-label="Clear canvas"
              >
                x
              </button>
            )}
            <span
              style={{ color: 'var(--pf-text-faint)', fontSize: '0.75rem' }}
            >
              (16:9 recommended, e.g. 1280×720)
            </span>
          </div>

          {/* Text Color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--pf-text-muted)' }}>Text:</span>
            <input
              type="color"
              value={settings.textColor}
              onChange={(e) => updateSetting({ textColor: e.target.value })}
              aria-label="Text color"
              style={{
                width: 28,
                height: 22,
                border: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Left BG Color — hidden when canvas overrides background */}
          {!settings.thumbnailCanvasPath && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--pf-text-muted)' }}>Left BG:</span>
              <input
                type="color"
                value={settings.leftBgColor}
                onChange={(e) => updateSetting({ leftBgColor: e.target.value })}
                aria-label="Left background color"
                style={{
                  width: 28,
                  height: 22,
                  border: 'none',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}

          {/* Right BG Color — hidden when canvas overrides background */}
          {!settings.thumbnailCanvasPath && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--pf-text-muted)' }}>Right BG:</span>
              <input
                type="color"
                value={settings.rightBgColor}
                onChange={(e) =>
                  updateSetting({ rightBgColor: e.target.value })
                }
                aria-label="Right background color"
                style={{
                  width: 28,
                  height: 22,
                  border: 'none',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ThumbnailSettingsBar;
