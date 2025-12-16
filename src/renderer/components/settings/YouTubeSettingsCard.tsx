import React from 'react';
import type { YoutubeSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: YoutubeSettings;
  onChange: (next: YoutubeSettings) => void;
};

const YouTubeSettingsCard: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="pf-card">
      <h2>YouTube API</h2>

      <div className="pf-field">
        <label>Client ID</label>
        <input
          value={value.clientId}
          onChange={(e) =>
            onChange({ ...value, clientId: e.target.value })
          }
        />
      </div>

      <div className="pf-field">
        <label>Project ID</label>
        <input
          value={value.projectId}
          onChange={(e) =>
            onChange({ ...value, projectId: e.target.value })
          }
        />
      </div>

      <SecretInput
        label="Client Secret"
        value={value.clientSecret}
        onChange={(next) =>
          onChange({ ...value, clientSecret: next })
        }
      />
    </div>
  );
};

export default YouTubeSettingsCard;
