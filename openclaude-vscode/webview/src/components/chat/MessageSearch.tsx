import React, { useEffect, useRef } from 'react';

interface MessageSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  currentIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function MessageSearch({
  query,
  onQueryChange,
  currentIndex,
  total,
  onNext,
  onPrev,
  onClose,
}: MessageSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  return (
    <div className="message-search-bar">
      <svg className="message-search-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M15.25 15.02l-4.625-4.625a5.5 5.5 0 1 0-.707.707l4.625 4.625.707-.707zM6.5 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        className="message-search-input"
        placeholder="Search messages..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {query && (
        <span className="message-search-count">
          {total > 0 ? `${currentIndex + 1}/${total}` : 'No results'}
        </span>
      )}
      <button className="message-search-nav" onClick={onPrev} disabled={total === 0} title="Previous (Shift+Enter)">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4l-6 6h12z" /></svg>
      </button>
      <button className="message-search-nav" onClick={onNext} disabled={total === 0} title="Next (Enter)">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-6-6h12z" /></svg>
      </button>
      <button className="message-search-close" onClick={onClose} title="Close (Escape)">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
        </svg>
      </button>
    </div>
  );
}
