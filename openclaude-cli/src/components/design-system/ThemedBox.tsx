import React, { type PropsWithChildren } from 'react';
import Box from '../../ink/components/Box.js';
import type { DOMElement } from '../../ink/dom.js';
import type { ClickEvent } from '../../ink/events/click-event.js';
import type { FocusEvent } from '../../ink/events/focus-event.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import type { Color, Styles } from '../../ink/styles.js';
import { getTheme, type Theme } from '../../utils/theme.js';
import { useTheme } from './ThemeProvider.js';

type ThemedColorProps = {
  readonly borderColor?: keyof Theme | Color;
  readonly borderTopColor?: keyof Theme | Color;
  readonly borderBottomColor?: keyof Theme | Color;
  readonly borderLeftColor?: keyof Theme | Color;
  readonly borderRightColor?: keyof Theme | Color;
  readonly backgroundColor?: keyof Theme | Color;
};

type BaseStylesWithoutColors = Omit<Styles, 'textWrap' | 'borderColor' | 'borderTopColor' | 'borderBottomColor' | 'borderLeftColor' | 'borderRightColor' | 'backgroundColor'>;

export type Props = BaseStylesWithoutColors & ThemedColorProps & {
  tabIndex?: number;
  autoFocus?: boolean;
  onClick?: (event: ClickEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onFocusCapture?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onBlurCapture?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyDownCapture?: (event: KeyboardEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function resolveColor(color: keyof Theme | Color | undefined, theme: Theme): Color | undefined {
  if (!color) return undefined;
  if (color.startsWith('rgb(') || color.startsWith('#') || color.startsWith('ansi256(') || color.startsWith('ansi:')) {
    return color as Color;
  }
  return theme[color as keyof Theme] as Color;
}

const ThemedBox = React.forwardRef<DOMElement, PropsWithChildren<Props>>((props, ref) => {
  const {
    borderColor,
    borderTopColor,
    borderBottomColor,
    borderLeftColor,
    borderRightColor,
    backgroundColor,
    borderStyle,
    children,
    ...rest
  } = props;

  const [themeName] = useTheme();
  const theme = getTheme(themeName);

  const resolvedBorderColor = resolveColor(borderColor, theme);
  const resolvedBorderTopColor = resolveColor(borderTopColor, theme);
  const resolvedBorderBottomColor = resolveColor(borderBottomColor, theme);
  const resolvedBorderLeftColor = resolveColor(borderLeftColor, theme);
  const resolvedBorderRightColor = resolveColor(borderRightColor, theme);
  const resolvedBackgroundColor = resolveColor(backgroundColor, theme);

  // Premium feel: Default to rounded borders if a border color is set but no style is given
  const hasAnyBorder = Boolean(
    resolvedBorderColor || 
    resolvedBorderTopColor || 
    resolvedBorderBottomColor || 
    resolvedBorderLeftColor || 
    resolvedBorderRightColor || 
    rest.borderTop || 
    rest.borderBottom || 
    rest.borderLeft || 
    rest.borderRight
  );

  const finalBorderStyle = borderStyle || (hasAnyBorder ? 'round' : undefined);

  return (
    <Box
      ref={ref}
      borderColor={resolvedBorderColor}
      borderTopColor={resolvedBorderTopColor}
      borderBottomColor={resolvedBorderBottomColor}
      borderLeftColor={resolvedBorderLeftColor}
      borderRightColor={resolvedBorderRightColor}
      backgroundColor={resolvedBackgroundColor}
      borderStyle={finalBorderStyle}
      {...rest}
    >
      {children}
    </Box>
  );
});

ThemedBox.displayName = 'ThemedBox';
export default ThemedBox;
