export interface ThemeTokens {
  primary: string;
  primaryStrong: string;
  gradientSecondary: string;
  background: string;
  surface: string;
  elevated: string;
  tint: string;
  text: string;
  textSecondary: string;
  muted: string;
  line: string;
  income: string;
  expense: string;
  warning: string;
  warningSurface: string;
  expenseSurface: string;
  onPrimary: string;
  onPrimaryMuted: string;
  shadowPrimary: string;
}

export const LIGHT_TOKENS: ThemeTokens = {
  primary: '#155EEF',
  primaryStrong: '#0B4ACB',
  gradientSecondary: '#4A9BFF',
  background: '#F3F7FF',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  tint: '#E3EDFF',
  text: '#17263F',
  textSecondary: '#334E7A',
  muted: '#6B7E9E',
  line: '#D9E5FA',
  income: '#138A72',
  expense: '#F15B6C',
  warning: '#B56B00',
  warningSurface: '#FFF4D6',
  expenseSurface: '#FFF1F2',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#DCE9FF',
  shadowPrimary: 'rgba(21, 94, 239, .20)',
};

export const DARK_TOKENS: ThemeTokens = {
  primary: '#5B9CFF',
  primaryStrong: '#8AB8FF',
  gradientSecondary: '#2F74F3',
  background: '#0B1220',
  surface: '#121C2E',
  elevated: '#18263D',
  tint: '#182E55',
  text: '#F3F7FF',
  textSecondary: '#C2D2EE',
  muted: '#9BACCA',
  line: '#263958',
  income: '#4AD6B6',
  expense: '#FF7182',
  warning: '#FFB020',
  warningSurface: '#3A2B12',
  expenseSurface: '#3A1E2A',
  onPrimary: '#0B1220',
  onPrimaryMuted: '#DCE9FF',
  shadowPrimary: 'rgba(91, 156, 255, .28)',
};
