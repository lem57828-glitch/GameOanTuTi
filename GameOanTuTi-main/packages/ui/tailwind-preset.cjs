// Preset Tailwind dùng chung: ánh xạ token CSS (src/tokens.css) thành lớp tiện ích.
/** @type {import('tailwindcss').Config} */
const rgb = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: rgb('--c-bg'), deep: rgb('--c-bg-deep') },
        surface: { DEFAULT: rgb('--c-surface'), 2: rgb('--c-surface-2') },
        line: rgb('--c-border'),
        ink: { DEFAULT: rgb('--c-text'), muted: rgb('--c-muted') },
        accent: { DEFAULT: rgb('--c-accent'), strong: rgb('--c-accent-strong'), on: rgb('--c-on-accent') },
        team: { blue: rgb('--c-blue'), pink: rgb('--c-pink') },
        success: rgb('--c-success'),
        warning: rgb('--c-warning'),
        danger: rgb('--c-danger'),
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      spacing: { gutter: 'var(--space-gutter)' },
      boxShadow: {
        focus: 'var(--focus-ring)',
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.35), 0 12px 40px -12px rgb(var(--c-accent) / 0.45)',
        deep: '0 24px 60px -24px rgb(0 0 0 / 0.7)',
      },
      keyframes: {
        'coin-flip': {
          '0%': { transform: 'rotateY(0deg) translateY(0)' },
          '50%': { transform: 'rotateY(900deg) translateY(-28px)' },
          '100%': { transform: 'rotateY(1800deg) translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pulse: { '50%': { opacity: '0.45' } },
      },
      animation: {
        'coin-flip': 'coin-flip 1.6s cubic-bezier(0.3, 0.7, 0.4, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'pop-in': 'pop-in 220ms ease-out both',
        pulse: 'pulse 1.6s ease-in-out infinite',
      },
    },
  },
};
