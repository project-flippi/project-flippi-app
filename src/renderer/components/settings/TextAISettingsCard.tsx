import type { TextAiSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: TextAiSettings;
  onChange: (next: TextAiSettings) => void;
};

function TextAISettingsCard({ value, onChange }: Props) {
  return (
    <div className="pf-card">
      <h2>Text Generation AI</h2>

      <div className="pf-field">
        <label htmlFor="ai-text-provider-select">
          Provider
          <select
            id="ai-text-provider-select"
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
        </label>
      </div>

      <SecretInput
        id="ai-text-api-key"
        label="AI Text API Key"
        value={value.apiKey}
        onChange={(next) => onChange({ ...value, apiKey: next })}
        placeholder=""
        autoComplete=""
      />
    </div>
  );
}

export default TextAISettingsCard;
