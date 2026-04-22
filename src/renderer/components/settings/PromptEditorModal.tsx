import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../hooks/useFocusTrap';

type Props = {
  title: string;
  systemPrompt: string;
  userPrompt: string;
  variables: string[];
  onClose: (next: { systemPrompt: string; userPrompt: string }) => void;
};

function PromptEditorModal({
  title,
  systemPrompt,
  userPrompt,
  variables,
  onClose,
}: Props) {
  const [editSystem, setEditSystem] = useState(systemPrompt);
  const [editUser, setEditUser] = useState(userPrompt);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const systemRef = useRef<HTMLTextAreaElement>(null);

  const handleClose = useCallback(() => {
    onClose({ systemPrompt: editSystem, userPrompt: editUser });
  }, [editSystem, editUser, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  useEffect(() => {
    systemRef.current?.focus();
  }, []);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="pf-video-modal-overlay"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={focusTrapRef}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="pf-video-modal-content pf-clip-expand-modal pf-clip-expand-modal--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-video-modal-header">
          <span className="pf-video-modal-title">{title}</span>
          <button
            type="button"
            className="pf-video-modal-close"
            onClick={handleClose}
            aria-label="Close editor"
          >
            &times;
          </button>
        </div>
        <div className="pf-clip-expand-fields">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="pf-clip-expand-label">
            System Prompt
            <textarea
              ref={systemRef}
              className="pf-clip-expand-textarea"
              value={editSystem}
              onChange={(e) => setEditSystem(e.target.value)}
              rows={6}
            />
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="pf-clip-expand-label">
            User Prompt
            <textarea
              className="pf-clip-expand-textarea"
              value={editUser}
              onChange={(e) => setEditUser(e.target.value)}
              rows={8}
            />
          </label>
          <span className="pf-note">
            Available variables: {variables.map((v) => `{${v}}`).join(', ')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default PromptEditorModal;
