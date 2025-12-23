import type { YoutubeSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: YoutubeSettings;
  onChange: (next: YoutubeSettings) => void;
};

function YouTubeSettingsCard({ value, onChange }: Props) {
  return (
    <div className="pf-card">
      <h2>YouTube API</h2>

      <div className="pf-field">
        <label htmlFor="youtube-client-id">
          Client ID
          <input
            id="youtube-client-id"
            value={value.clientId}
            onChange={(e) => onChange({ ...value, clientId: e.target.value })}
          />
        </label>
      </div>

      <div className="pf-field">
        <label htmlFor="youtube-project-id">
          Project ID
          <input
            id="youtube-project-id"
            value={value.projectId}
            onChange={(e) => onChange({ ...value, projectId: e.target.value })}
          />
        </label>
      </div>

      <SecretInput
        id="youtube-client-secret"
        label="Youtube Client Secret"
        value={value.clientSecret}
        onChange={(next) => onChange({ ...value, clientSecret: next })}
        placeholder=""
        autoComplete="off"
      />
    </div>
  );
}

export default YouTubeSettingsCard;
