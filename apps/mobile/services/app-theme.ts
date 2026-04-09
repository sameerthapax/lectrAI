export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export type AppTheme = {
  mode: ThemeMode;
  resolvedMode: ResolvedTheme;
  colors: {
    screen: string;
    card: string;
    cardMuted: string;
    border: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    accent: string;
    accentSoft: string;
    accentContrast: string;
    accentMuted: string;
    accentBorder: string;
    switchTrackOff: string;
    switchTrackOn: string;
    switchThumbOff: string;
    switchThumbOn: string;
    inputBackground: string;
    inputBorder: string;
    inputPlaceholder: string;
    hairline: string;
    pill: string;
    overlay: string;
    modalBackdrop: string;
    danger: string;
    dangerSoft: string;
    dangerBorder: string;
    success: string;
    successSoft: string;
    successBorder: string;
    neutralSoft: string;
    neutralBorder: string;
    emphasis: string;
  };
};

export function resolveThemeMode(
  preferredMode: ThemeMode,
  systemMode: ResolvedTheme | null | undefined
): ResolvedTheme {
  if (preferredMode === 'system') {
    return systemMode === 'dark' ? 'dark' : 'light';
  }

  return preferredMode;
}

export function createAppTheme(mode: ThemeMode, resolvedMode: ResolvedTheme): AppTheme {
  if (resolvedMode === 'dark') {
    return {
      mode,
      resolvedMode,
      colors: {
        screen: '#111315',
        card: '#1a1e22',
        cardMuted: '#20262b',
        border: '#2f363d',
        text: '#f5f3ee',
        textMuted: '#b7b0a7',
        textSubtle: '#938a7f',
        accent: '#ff8a3d',
        accentSoft: '#4c2b16',
        accentContrast: '#ffffff',
        accentMuted: '#f4c9a8',
        accentBorder: '#7a4320',
        switchTrackOff: '#454f59',
        switchTrackOn: '#a44f15',
        switchThumbOff: '#f4ede4',
        switchThumbOn: '#ff8a3d',
        inputBackground: '#161a1e',
        inputBorder: '#394149',
        inputPlaceholder: '#7e756c',
        hairline: '#2a3036',
        pill: '#22282d',
        overlay: 'rgba(26, 30, 34, 0.78)',
        modalBackdrop: 'rgba(4, 7, 10, 0.72)',
        danger: '#f87171',
        dangerSoft: '#3f1d22',
        dangerBorder: '#6e2b35',
        success: '#4ade80',
        successSoft: '#132b1c',
        successBorder: '#245033',
        neutralSoft: '#1f252b',
        neutralBorder: '#394149',
        emphasis: '#ffffff',
      },
    };
  }

  return {
    mode,
    resolvedMode,
    colors: {
      screen: '#f7f1e8',
      card: '#fffaf3',
      cardMuted: '#fff6ed',
      border: '#eadfce',
      text: '#0b0b0b',
      textMuted: '#6a6157',
      textSubtle: '#9b8f81',
      accent: '#ff6a00',
      accentSoft: '#ffeddc',
      accentContrast: '#ffffff',
      accentMuted: '#c2410c',
      accentBorder: '#fed7aa',
      switchTrackOff: '#d8cec0',
      switchTrackOn: '#ffb480',
      switchThumbOff: '#f8f1e6',
      switchThumbOn: '#ff6a00',
      inputBackground: '#ffffff',
      inputBorder: '#e2d6c7',
      inputPlaceholder: '#9b8f81',
      hairline: '#eee3d5',
      pill: '#f3e7d6',
      overlay: 'rgba(255,255,255,0.72)',
      modalBackdrop: 'rgba(15, 23, 42, 0.55)',
      danger: '#ef4444',
      dangerSoft: '#fff1f2',
      dangerBorder: '#fee2e2',
      success: '#16a34a',
      successSoft: '#eefbf3',
      successBorder: '#bbf7d0',
      neutralSoft: '#f8fafc',
      neutralBorder: '#e2e8f0',
      emphasis: '#0f172a',
    },
  };
}
