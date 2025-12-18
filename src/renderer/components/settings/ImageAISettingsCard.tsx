import React from 'react';
import type { ImageAiSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: ImageAiSettings;
  onChange: (next: ImageAiSettings) => void;
};

const ImageAISettingsCard: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="pf-card">
      <h2>Image Generation AI</h2>

      <div className="pf-field">
        <label>Provider</label>
        <select
          value={value.provider}
          onChange={(e) =>
            onChange({
              ...value,
              provider: e.target.value as ImageAiSettings['provider'],
            })
          }
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>

      <SecretInput
        label="API Key"
        value={value.apiKey}
        onChange={(next) => onChange({ ...value, apiKey: next })}
      />
    </div>
  );
};

export default ImageAISettingsCard;
