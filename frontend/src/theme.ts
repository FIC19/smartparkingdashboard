export const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#d1d5db',
  text: '#111827',
  textMid: '#4b5563',
  textLight: '#9ca3af',
  textFaint: '#cbd5e1',
  green: '#16a34a',
  greenDark: '#14532d',
  greenLight: '#bbf7d0',
  blue: '#2563eb',
  purple: '#7c3aed',
  amber: '#d97706',
  red: '#dc2626',
  redLight: '#fecaca',
  redFaint: '#fef2f2',
  navyDark: '#052e16',
  navyLight: '#0f3f2a',
};

export const F = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 17,
  '2xl': 24,
  '3xl': 30,
};

export const R = {
  md: 8,
  lg: 12,
};

export const SH = {
  green: '0 12px 24px rgba(22, 163, 74, 0.24)',
};

export const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: ${C.bg}; }
  button, input, select { font-family: inherit; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
