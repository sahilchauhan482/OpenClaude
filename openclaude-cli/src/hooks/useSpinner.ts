import { useState, useEffect } from 'react';

export function useSpinner(intervalMs = 80) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return frame;
}
