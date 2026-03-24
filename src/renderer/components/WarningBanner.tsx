import { useState } from 'react';

interface WarningBannerProps {
  /** Warning message text */
  message: string;
  /** Optional action button label (e.g. "Relaunch OBS") */
  actionLabel?: string;
  /** Label shown while the action is executing */
  actionBusyLabel?: string;
  /** Async action to execute when the button is clicked */
  onAction?: () => Promise<{ ok: boolean; message: string }>;
  /** Called if the action returns ok: false or throws */
  onError?: (message: string) => void;
}

/**
 * A warning banner with optional action button.
 * Uses the .pf-warning-banner CSS class for styling.
 */
function WarningBanner({
  message,
  actionLabel = undefined,
  actionBusyLabel = undefined,
  onAction = undefined,
  onError = undefined,
}: WarningBannerProps) {
  const [busy, setBusy] = useState(false);

  async function handleAction() {
    if (!onAction) return;
    setBusy(true);
    try {
      const res = await onAction();
      if (!res.ok) {
        onError?.(res.message);
      }
    } catch (e: any) {
      onError?.(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="alert" className="pf-warning-banner">
      <span style={{ flex: 1 }}>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="pf-button pf-button-primary"
          style={{ whiteSpace: 'nowrap', fontSize: 13 }}
          disabled={busy}
          onClick={handleAction}
        >
          {busy ? (actionBusyLabel ?? actionLabel) : actionLabel}
        </button>
      )}
    </div>
  );
}

export default WarningBanner;
