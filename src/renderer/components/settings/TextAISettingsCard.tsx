import type { TextAiSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: TextAiSettings;
  onChange: (next: TextAiSettings) => void;
};

const DEFAULT_MODELS: Record<TextAiSettings['provider'], string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.0-flash',
};

function TextAISettingsCard({ value, onChange }: Props) {
  return (
    <div className="pf-card">
      <h2>Text Generation AI (Optional)</h2>

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

      <div className="pf-field">
        <label htmlFor="ai-text-model">
          Model
          <input
            id="ai-text-model"
            type="text"
            value={value.model}
            placeholder={DEFAULT_MODELS[value.provider]}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
          />
          <span className="pf-note">Leave blank for default.</span>
        </label>
      </div>
    </div>
  );
}

export default TextAISettingsCard;
