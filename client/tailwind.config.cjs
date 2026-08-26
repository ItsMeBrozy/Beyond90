/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        surface3: 'rgb(var(--c-surface3) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        line2: 'rgb(var(--c-line2) / <alpha-value>)',
        txt: 'rgb(var(--c-txt) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          strong: 'rgb(var(--c-accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
          ink: 'rgb(var(--c-accent-ink) / <alpha-value>)',
        },
        live: 'rgb(var(--c-live) / <alpha-value>)',
        win: 'rgb(var(--c-win) / <alpha-value>)',
        draw: 'rgb(var(--c-draw) / <alpha-value>)',
        loss: 'rgb(var(--c-loss) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI Variable Display',
          'Segoe UI',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.06)',
        pop: '0 8px 30px rgb(0 0 0 / 0.25)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        scoreFlash: {
          '0%': { backgroundColor: 'rgb(var(--c-accent) / 0.35)' },
          '100%': { backgroundColor: 'transparent' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.35s cubic-bezier(0.22,1,0.36,1) both',
        fadeIn: 'fadeIn 0.25s ease both',
        shimmer: 'shimmer 1.6s linear infinite',
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        scoreFlash: 'scoreFlash 1.2s ease-out both',
        slideDown: 'slideDown 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
