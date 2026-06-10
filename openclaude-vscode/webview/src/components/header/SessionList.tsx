import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SessionCard } from './SessionCard';
import type { SessionData, GroupedSessionData } from '../../hooks/useSession';

interface SessionListProps {
  groupedSessions: GroupedSessionData[];
  filteredSessions: SessionData[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeSessionId: string | null;
  onResumeSession: (session: SessionData) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

const BOOKMARKS_KEY = 'openclaude.session.bookmarks';

function loadBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveBookmarks(bookmarks: Set<string>) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarks]));
}

export const SessionList: React.FC<SessionListProps> = ({
  groupedSessions,
  filteredSessions,
  searchQuery,
  onSearchChange,
  activeSessionId,
  onResumeSession,
  onDeleteSession,
  onClose,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isSearching = searchQuery.trim().length > 0;
  const [bookmarks, setBookmarks] = useState<Set<string>>(loadBookmarks);

  const toggleBookmark = useCallback((sessionId: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      saveBookmarks(next);
      return next;
    });
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler);
      cleanup = () => document.removeEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [onClose]);

  const allSessions = groupedSessions.flatMap((g) => g.sessions);
  const pinnedSessions = allSessions.filter((s) => bookmarks.has(s.id));

  const BookmarkButton = ({ sessionId }: { sessionId: string }) => (
    <button
      className={`bookmark-icon${bookmarks.has(sessionId) ? ' bookmark-active' : ''}`}
      onClick={(e) => { e.stopPropagation(); toggleBookmark(sessionId); }}
      title={bookmarks.has(sessionId) ? 'Remove bookmark' : 'Bookmark session'}
      aria-label={bookmarks.has(sessionId) ? 'Remove bookmark' : 'Bookmark session'}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill={bookmarks.has(sessionId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.5l2 4 4.5.65-3.25 3.17.77 4.48L8 11.77l-4.02 2.03.77-4.48L1.5 6.15 6 5.5z" />
      </svg>
    </button>
  );

  return (
    <div
      ref={panelRef}
      className="absolute top-[40px] left-0 right-0 z-50 bg-[var(--vscode-sideBar-background)] border border-vscode-border rounded-b shadow-lg max-h-[400px] flex flex-col"
    >
      <div className="px-3 py-2 border-b border-vscode-border">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50"
            width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
          >
            <path d="M15.25 15.02l-4.625-4.625a5.5 5.5 0 1 0-.707.707l4.625 4.625.707-.707zM6.5 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search past conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-vscode-input-bg text-vscode-input-fg border border-vscode-input-border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 py-1">
        {/* Pinned sessions */}
        {!isSearching && pinnedSessions.length > 0 && (
          <div className="session-group-pinned">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">
              Pinned
            </div>
            {pinnedSessions.map((s) => (
              <div key={s.id} className="group relative flex items-center">
                <div className="flex-1">
                  <SessionCard
                    session={s}
                    isActive={s.id === activeSessionId}
                    onResume={onResumeSession}
                    onDelete={onDeleteSession}
                  />
                </div>
                <div className="pr-2">
                  <BookmarkButton sessionId={s.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        {isSearching ? (
          filteredSessions.length > 0 ? (
            filteredSessions.map((s) => (
              <div key={s.id} className="group relative flex items-center">
                <div className="flex-1">
                  <SessionCard
                    session={s}
                    isActive={s.id === activeSessionId}
                    onResume={onResumeSession}
                    onDelete={onDeleteSession}
                  />
                </div>
                <div className="pr-2">
                  <BookmarkButton sessionId={s.id} />
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-xs opacity-50">
              No sessions matching &ldquo;{searchQuery}&rdquo;
            </div>
          )
        ) : groupedSessions.length > 0 ? (
          groupedSessions.map((group) => (
            <div key={group.group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">
                {group.group}
              </div>
              {group.sessions.map((s) => (
                <div key={s.id} className="group relative flex items-center">
                  <div className="flex-1">
                    <SessionCard
                      session={s}
                      isActive={s.id === activeSessionId}
                      onResume={onResumeSession}
                      onDelete={onDeleteSession}
                    />
                  </div>
                  <div className="pr-2">
                    <BookmarkButton sessionId={s.id} />
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-xs opacity-50">
            No past conversations yet
          </div>
        )}
      </div>
    </div>
  );
};
