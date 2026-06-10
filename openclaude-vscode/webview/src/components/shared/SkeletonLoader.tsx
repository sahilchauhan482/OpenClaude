import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'message' | 'code';
}

export function SkeletonLoader({ variant = 'message' }: SkeletonLoaderProps) {
  if (variant === 'code') {
    return (
      <div className="skeleton-block">
        <div className="skeleton-code" />
      </div>
    );
  }

  return (
    <div className="skeleton-block">
      <div className="skeleton-line" style={{ width: '100%' }} />
      <div className="skeleton-line" style={{ width: '85%' }} />
      <div className="skeleton-line" style={{ width: '60%' }} />
    </div>
  );
}
