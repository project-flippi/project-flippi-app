import type { ObsSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: ObsSettings;
  onChange: (next: ObsSettings) => void;
};

function OBSSettingsCard({ value, onChange }: Props) {
  return (
    <div className="pf-card">
      <h2>OBS</h2>

      <div className="pf-field">
        <label htmlFor="obs-host">
          Host
          <input
            id="obs-host"
            value={value.host}
            onChange={(e) => onChange({ ...value, host: e.target.value })}
          />
        </label>
      </div>

      <div className="pf-field">
        <label htmlFor="obs-port">
          Port
          <input
            id="obs-port"
            value={value.port}
            onChange={(e) => onChange({ ...value, port: e.target.value })}
          />
        </label>
      </div>

      <SecretInput
        id="obs-password"
        label="OBS Password"
        value={value.password}
        onChange={(next) => onChange({ ...value, password: next })}
        placeholder=""
        autoComplete="off"
      />
    </div>
  );
}

export default OBSSettingsCard;
