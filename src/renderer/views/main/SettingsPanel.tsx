import useSettings from '../../hooks/useSettings';

import YouTubeSettingsCard from '../../components/settings/YouTubeSettingsCard';
import OBSSettingsCard from '../../components/settings/OBSSettingsCard';
import TextAISettingsCard from '../../components/settings/TextAISettingsCard';
import ImageAISettingsCard from '../../components/settings/ImageAISettingsCard';

function SettingsPanel() {
  const {
    draft,
    isLoading,
    isSaving,
    status,
    isDirty,
    save,
    reset,
    updateSection,
  } = useSettings();

  if (isLoading || !draft) {
    return (
      <section className="pf-section pf-settings">
        <h1>Settings</h1>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <section className="pf-section pf-settings">
      <h1>Settings</h1>

      <div className="pf-settings-grid">
        <YouTubeSettingsCard
          value={draft.youtube}
          onChange={(next) => updateSection('youtube', next)}
        />

        <OBSSettingsCard
          value={draft.obs}
          onChange={(next) => updateSection('obs', next)}
        />

        <TextAISettingsCard
          value={draft.textAi}
          onChange={(next) => updateSection('textAi', next)}
        />

        <ImageAISettingsCard
          value={draft.imageAi}
          onChange={(next) => updateSection('imageAi', next)}
        />
      </div>

      <div className="pf-settings-actions">
        <button
          type="button"
          className="pf-button pf-button-primary"
          onClick={save}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save Settings'}
        </button>

        <button
          type="button"
          className="pf-button"
          onClick={reset}
          disabled={!isDirty || isSaving}
        >
          Reset
        </button>

        {status && <span className="pf-status-message">{status.message}</span>}
      </div>
    </section>
  );
}

export default SettingsPanel;
