/**
 * Central Theme Tokens for CloverPal Offline AI
 * Premium dark palette: Slate-950 background, Emerald-500 accent, Slate-100 text.
 */

export const theme = {
  colors: {
    bgCanvas: '#020617', // slate-950
    bgSurface: '#0f172a', // slate-900
    bgCard: '#1e293b', // slate-800
    bgInput: '#0d1527',
    border: '#1e293b',
    borderLight: '#334155',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    emerald: '#10b981',
    emeraldDark: '#047857',
    emeraldLight: '#064e3b',
    emeraldText: '#34d399',
    amber: '#f59e0b',
    red: '#ef4444',
    indigo: '#6366f1',
    white: '#ffffff',
  },
  avatarColors: {
    clover: '#059669', // emerald
    aegis: '#475569', // slate
    athena: '#4f46e5', // indigo
    kaelen: '#d97706', // amber
    default: '#10b981',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    full: 9999,
  },
  typography: {
    title: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: '#f8fafc',
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '400' as const,
      color: '#94a3b8',
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: '#e2e8f0',
    },
    mono: {
      fontSize: 12,
      fontFamily: 'monospace',
    },
    caption: {
      fontSize: 11,
      color: '#64748b',
    },
  },
};
