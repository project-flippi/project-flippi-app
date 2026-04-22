import { useState } from 'react';
import type { TextAiPromptConfig } from '../../../main/settings/schema';
import PromptEditorModal from './PromptEditorModal';

type Props = {
  title: string;
  value: TextAiPromptConfig;
  variables: string[];
  onChange: (next: TextAiPromptConfig) => void;
};

function PromptSettingsCard({ title, value, variables, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="pf-card">
      <h2>{title}</h2>

      <div className="pf-field">
        <button
          type="button"
          className="pf-button"
          onClick={() => setEditing(true)}
        >
          Edit Prompts
        </button>
      </div>

      <div className="pf-field">
        <label htmlFor={`prompt-max-tokens-${title}`}>
          Max Tokens
          <input
            id={`prompt-max-tokens-${title}`}
            type="number"
            min={1}
            max={8192}
            step={1}
            value={value.maxTokens}
            onChange={(e) =>
              onChange({
                ...value,
                maxTokens: Number.parseInt(e.target.value, 10) || 0,
              })
            }
          />
        </label>
      </div>

      <div className="pf-field">
        <label htmlFor={`prompt-temperature-${title}`}>
          Temperature
          <input
            id={`prompt-temperature-${title}`}
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={value.temperature}
            onChange={(e) =>
              onChange({
                ...value,
                temperature: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </label>
      </div>

      {editing && (
        <PromptEditorModal
          title={`${title} — Edit Prompts`}
          systemPrompt={value.systemPrompt}
          userPrompt={value.userPrompt}
          variables={variables}
          onClose={(next) => {
            setEditing(false);
            if (
              next.systemPrompt !== value.systemPrompt ||
              next.userPrompt !== value.userPrompt
            ) {
              onChange({ ...value, ...next });
            }
          }}
        />
      )}
    </div>
  );
}

export default PromptSettingsCard;
