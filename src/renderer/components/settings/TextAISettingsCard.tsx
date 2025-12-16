import React from 'react';
import type { TextAiSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: TextAiSettings;
  onChange: (next: TextAiSettings) => void;
};

const TextAISettingsCard: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="pf-card">
      <h2>Text Generation AI</h2>

      <div className="pf-field">
        <label>Provider</label>
        <select
          value={value.provider}
          onChange={(e) =>
            onChange({
              ...value,
              provider: e.target.value as TextAiSettings['provider'],
            })
          }
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="claude">Claude</option>
        </select>
      </div>

      <SecretInput
        label="API Key"
        value={value.apiKey}
        onChange={(next) =>
          onChange({ ...value, apiKey: next })
        }
      />
    </div>
  );
};

export default TextAISettingsCard;
