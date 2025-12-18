import React from 'react';
import type { ObsSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: ObsSettings;
  onChange: (next: ObsSettings) => void;
};

const OBSSettingsCard: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="pf-card">
      <h2>OBS</h2>

      <div className="pf-field">
        <label>Host</label>
        <input
          value={value.host}
          onChange={(e) => onChange({ ...value, host: e.target.value })}
        />
      </div>

      <div className="pf-field">
        <label>Port</label>
        <input
          value={value.port}
          onChange={(e) => onChange({ ...value, port: e.target.value })}
        />
      </div>

      <SecretInput
        label="OBS Password"
        value={value.password}
        onChange={(next) => onChange({ ...value, password: next })}
      />
    </div>
  );
};

export default OBSSettingsCard;
