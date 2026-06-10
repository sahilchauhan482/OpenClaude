import React, { useEffect, useRef } from 'react';

interface KeyboardShortcutGuideProps {
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'K'], description: 'Keyboard shortcuts' },
      { keys: ['Ctrl/Cmd', 'F'], description: 'Search messages' },
      { keys: ['Escape'], description: 'Close overlay / Stop streaming' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['↑'], description: 'Edit last message (when input empty)' },
      { keys: ['/'], description: 'Slash commands' },
      { keys: ['@'], description: 'Mention files' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Right-click'], description: 'Context menu on messages' },
      { keys: ['Drag & Drop'], description: 'Add files to input' },
    ],
  },
];

export function KeyboardShortcutGuide({ onClose }: KeyboardShortcutGuideProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div className="shortcut-overlay" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="shortcut-dialog">
        <div className="shortcut-header">
          <h2 className="shortcut-title">Keyboard Shortcuts</h2>
          <button className="shortcut-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        </div>
        <div className="shortcut-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcut-group">
              <h3 className="shortcut-group-title">{group.title}</h3>
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="shortcut-row">
                  <span className="shortcut-description">{shortcut.description}</span>
                  <span className="shortcut-keys">
                    {shortcut.keys.map((key, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span className="shortcut-plus">+</span>}
                        <kbd className="shortcut-kbd">{key}</kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
