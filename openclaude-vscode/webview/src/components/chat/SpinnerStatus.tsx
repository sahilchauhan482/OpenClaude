import React, { useState, useEffect, useRef } from 'react';

interface SpinnerStatusProps {
  isActive: boolean;
  customVerbs: string[];
  customTips: string[];
  tipsEnabled: boolean;
  reducedMotion: boolean;
  message?: string;
}

const DEFAULT_VERBS = ['Thinking', 'Working', 'Processing', 'Analyzing'];
const DEFAULT_TIPS = [
  'Tip: Use @file to reference specific files',
  'Tip: Use /help to see all commands',
  'Tip: Press Escape to cancel',
];

export const SpinnerStatus: React.FC<SpinnerStatusProps> = ({
  isActive,
  customVerbs,
  customTips,
  tipsEnabled,
  reducedMotion,
  message,
}) => {
  const verbs = customVerbs.length > 0 ? customVerbs : DEFAULT_VERBS;
  const tips = customTips.length > 0 ? customTips : DEFAULT_TIPS;

  const [verbIndex, setVerbIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const verbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      setVerbIndex(0);
      setTipIndex(0);
      return;
    }

    verbIntervalRef.current = setInterval(() => {
      setVerbIndex((prev) => (prev + 1) % verbs.length);
    }, 3000);

    tipIntervalRef.current = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 8000);

    return () => {
      if (verbIntervalRef.current) clearInterval(verbIntervalRef.current);
      if (tipIntervalRef.current) clearInterval(tipIntervalRef.current);
    };
  }, [isActive, verbs.length, tips.length]);

  if (!isActive) return null;

  return (
    <div className="spinner-row spinner-row-elevated">
      <div
        className="spinner-row-glyph"
        style={{ animation: reducedMotion ? 'none' : 'spin 1s linear infinite' }}
        role="status"
        aria-label="Loading"
      />
      <span className="spinner-row-copy">{message ?? `${verbs[verbIndex]}...`}</span>
      {tipsEnabled && (
        <span className="spinner-row-tip">
          {tips[tipIndex]}
        </span>
      )}
    </div>
  );
};
