export interface ThemeTokens {
  primary: string;
  primaryStrong: string;
  gradientSecondary: string;
  accent: string;
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
  focus: string;
  successSurface: string;
}

export const LIGHT_TOKENS: ThemeTokens = {
  primary: '#2F6F64',
  primaryStrong: '#255A51',
  gradientSecondary: '#4B8B7F',
  accent: '#FF9671',
  background: '#FBF7F0',
  surface: '#FFFFFF',
  elevated: '#FEFDFB',
  tint: '#EAF4F1',
  text: '#24312D',
  textSecondary: '#44524D',
  muted: '#66736E',
  line: '#E5DDD3',
  income: '#1B7D68',
  expense: '#D5534C',
  warning: '#A8492C',
  warningSurface: '#FFF0E9',
  expenseSurface: '#FDECEA',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#D6EEE7',
  shadowPrimary: 'rgba(47, 111, 100, .16)',
  focus: '#2F6F64',
  successSurface: '#EAF4F1',
};

export const DARK_TOKENS: ThemeTokens = {
  primary: '#74C6B2',
  primaryStrong: '#9AD8C8',
  gradientSecondary: '#4B8B7F',
  accent: '#FF9F7D',
  background: '#101714',
  surface: '#18221F',
  elevated: '#1D2925',
  tint: '#203C35',
  text: '#F7F4EF',
  textSecondary: '#D5DDD9',
  muted: '#A5B2AD',
  line: '#30433D',
  income: '#7BD4BD',
  expense: '#FF9389',
  warning: '#FFBA8E',
  warningSurface: '#45291F',
  expenseSurface: '#432423',
  onPrimary: '#10231E',
  onPrimaryMuted: '#D6EEE7',
  shadowPrimary: 'rgba(0, 0, 0, .28)',
  focus: '#74C6B2',
  successSurface: '#203C35',
};
