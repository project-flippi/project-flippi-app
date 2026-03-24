import React, { useState } from 'react';

interface InlineConfirmProps {
  /** Text shown on the trigger button */
  triggerLabel: string;
  /** Text shown in the "Are you sure?" prompt */
  prompt: string;
  /** Called when the user confirms */
  onConfirm: () => void | Promise<void>;
  /** Whether the action is currently executing */
  busy?: boolean;
  /** Label shown on the confirm button while busy */
  busyLabel?: string;
  /** Whether the trigger button should be disabled */
  disabled?: boolean;
  /** If true, trigger uses danger styling. Default true. */
  danger?: boolean;
  /** CSS class for sizing — use pf-button-sm or pf-button-md */
  sizeClass?: string;
  /** Additional inline styles on the wrapper */
  style?: React.CSSProperties;
}

/**
 * Inline confirmation pattern: a trigger button that, when clicked,
 * expands into a "prompt + Yes/No" inline UI. Avoids window.confirm()
 * and modal dialogs per Electron best practices.
 */
function InlineConfirm({
  triggerLabel,
  prompt,
  onConfirm,
  busy = false,
  busyLabel = 'Deleting\u2026',
  disabled = false,
  danger = true,
  sizeClass = 'pf-button-sm',
  style = undefined,
}: InlineConfirmProps) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    await onConfirm();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="pf-inline-confirm" style={style}>
        <span className="pf-inline-confirm-prompt">{prompt}</span>
        <button
          type="button"
          className={`pf-button pf-button-danger ${sizeClass}`}
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? busyLabel : 'Yes'}
        </button>
        <button
          type="button"
          className={`pf-button ${sizeClass}`}
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`pf-button ${danger ? 'pf-button-danger' : ''} ${sizeClass}`}
      onClick={() => setConfirming(true)}
      disabled={disabled || busy}
      style={style}
    >
      {triggerLabel}
    </button>
  );
}

export default InlineConfirm;
