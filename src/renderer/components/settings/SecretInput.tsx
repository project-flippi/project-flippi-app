import { useState } from 'react';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoComplete: string;
};

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.1 3.51 3.51 2.1 21.9 20.49 20.49 21.9l-2.2-2.2A10.87 10.87 0 0 1 12 21C5 21 2 12 2 12a20.2 20.2 0 0 1 5.1-6.41L2.1 3.51ZM12 7a5 5 0 0 1 5 5c0 .54-.09 1.06-.25 1.55l-1.62-1.62c.04-.3.07-.61.07-.93a3.2 3.2 0 0 0-3.2-3.2c-.32 0-.63.03-.93.07L9.45 6.25C10.94 5.7 11.46 5.7 12 7Zm0 10a5 5 0 0 1-5-5c0-.54.09-1.06.25-1.55l1.62 1.62c-.04.3-.07.61-.07.93a3.2 3.2 0 0 0 3.2 3.2c.32 0 .63-.03.93-.07l1.62 1.62c-.49.16-1.01.25-1.55.25Zm9.9-5s-.78 1.82-2.33 3.64l-3.05-3.05A4.98 4.98 0 0 0 12 7c-.47 0-.93.06-1.37.19L8.2 4.76A11.48 11.48 0 0 1 12 3c7 0 10 9 10 9Z"
      />
    </svg>
  );
}

function SecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: Props) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <div className="pf-field">
      <label htmlFor={id}>{label}</label>

      <div className="pf-secret-wrap">
        <input
          id={id}
          type={isRevealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pf-secret-input"
        />

        <button
          type="button"
          className="pf-eye-button"
          onClick={() => setIsRevealed((v) => !v)}
          aria-label={isRevealed ? 'Hide value' : 'Reveal value'}
          title={isRevealed ? 'Hide' : 'Reveal'}
        >
          {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

export default SecretInput;
