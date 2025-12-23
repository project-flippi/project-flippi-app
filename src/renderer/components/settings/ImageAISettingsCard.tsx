import type { ImageAiSettings } from '../../../main/settings/schema';
import SecretInput from './SecretInput';

type Props = {
  value: ImageAiSettings;
  onChange: (next: ImageAiSettings) => void;
};

function ImageAISettingsCard({ value, onChange }: Props) {
  return (
    <div className="pf-card">
      <h2>Image Generation AI</h2>

      <div className="pf-field">
        <label htmlFor="ai-image-provider-select">
          Provider
          <select
            id="ai-image-provider-select"
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
        </label>
      </div>

      <SecretInput
        id="ai-image-api-key"
        label="AI Image API Key"
        value={value.apiKey}
        onChange={(next) => onChange({ ...value, apiKey: next })}
        placeholder=""
        autoComplete=""
      />
    </div>
  );
}

export default ImageAISettingsCard;
