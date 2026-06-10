import { useState, useMemo, useCallback } from 'react';
import type { ChatMessage } from '../types/chat';

interface MessageMatch {
  messageId: string;
  messageIndex: number;
}

interface UseMessageSearchResult {
  query: string;
  setQuery: (q: string) => void;
  matches: MessageMatch[];
  currentIndex: number;
  currentMatchId: string | null;
  next: () => void;
  prev: () => void;
  total: number;
}

function getMessageText(msg: ChatMessage): string {
  if (msg.text) return msg.text;
  if (msg.blocks) {
    return msg.blocks
      .map((b) => {
        if (b.block.type === 'text' && 'text' in b.block) return b.block.text;
        return '';
      })
      .join('\n');
  }
  return '';
}

export function useMessageSearch(messages: ChatMessage[]): UseMessageSearchResult {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQ = query.toLowerCase();
    const results: MessageMatch[] = [];
    for (let i = 0; i < messages.length; i++) {
      const text = getMessageText(messages[i]).toLowerCase();
      if (text.includes(lowerQ)) {
        results.push({ messageId: messages[i].id, messageIndex: i });
      }
    }
    return results;
  }, [messages, query]);

  const currentMatchId = matches.length > 0 ? matches[currentIndex]?.messageId ?? null : null;

  const next = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleSetQuery = useCallback((q: string) => {
    setQuery(q);
    setCurrentIndex(0);
  }, []);

  return {
    query,
    setQuery: handleSetQuery,
    matches,
    currentIndex,
    currentMatchId,
    next,
    prev,
    total: matches.length,
  };
}
