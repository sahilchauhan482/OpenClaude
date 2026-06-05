interface StreamingIndicatorProps {
  visible: boolean;
}

export function StreamingIndicator({ visible }: StreamingIndicatorProps) {
  if (!visible) return null;

  return (
    <div className="streaming-indicator" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="streaming-indicator-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}
