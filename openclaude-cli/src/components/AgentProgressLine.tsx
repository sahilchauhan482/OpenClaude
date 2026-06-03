import React from 'react';
import { Box, Text } from '../ink.js';
import { formatNumber } from '../utils/format.js';
import type { Theme } from '../utils/theme.js';
import { useSpinner } from '../hooks/useSpinner.js';

type Props = {
  agentType: string;
  description?: string;
  name?: string;
  descriptionColor?: keyof Theme;
  taskDescription?: string;
  toolUseCount: number;
  tokens: number | null;
  color?: keyof Theme;
  isLast: boolean;
  isResolved: boolean;
  isError: boolean;
  isAsync?: boolean;
  shouldAnimate: boolean;
  lastToolInfo?: string | null;
  hideType?: boolean;
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function AgentProgressLine({
  agentType,
  description,
  name,
  descriptionColor = 'text',
  taskDescription,
  toolUseCount,
  tokens,
  color = 'claude',
  isLast,
  isResolved,
  isError,
  isAsync = false,
  shouldAnimate,
  lastToolInfo,
  hideType = false
}: Props) {
  const frame = useSpinner();
  const treeChar = isLast ? '└─' : '├─';
  const isBackgrounded = isAsync && isResolved;

  const getStatusText = () => {
    if (!isResolved) {
      return lastToolInfo || 'Initializing…';
    }
    if (isBackgrounded) {
      return taskDescription ?? 'Running in the background';
    }
    return 'Done';
  };

  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];

  return (
    <Box>
      <Box marginRight={1}>
        <Text dimColor>{treeChar}</Text>
      </Box>
      <Box marginRight={1}>
        {(!isResolved && shouldAnimate) ? (
          <Text color={color}>{spinnerChar}</Text>
        ) : isError ? (
          <Text color="error">×</Text>
        ) : (
          <Text color="success">✓</Text>
        )}
      </Box>

      {!hideType && (
        <Box marginRight={1}>
          <Text color={color} bold>
            {name ? `@${name}` : agentType}
          </Text>
        </Box>
      )}

      {description && (
        <Box marginRight={1}>
          <Text color={descriptionColor}>{description}</Text>
        </Box>
      )}

      <Box marginRight={1}>
        <Text dimColor>—</Text>
      </Box>

      <Box marginRight={2}>
        <Text dimColor={isResolved}>{getStatusText()}</Text>
      </Box>

      <Box>
        <Text dimColor>
          · {toolUseCount} tool{toolUseCount === 1 ? '' : 's'} · {tokens ? formatNumber(tokens) : 0} tokens
        </Text>
      </Box>
    </Box>
  );
}
