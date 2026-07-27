import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf5',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#86efad',
          400: '#4ade84',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.25rem', // 20px
        '3xl': '1.5rem',  // 24px
        '4xl': '2rem',
      },
      boxShadow: {
        'soft':  '0 2px 10px -2px rgba(0, 0, 0, 0.2), 0 4px 20px -4px rgba(0, 0, 0, 0.3)',
        'card':  '0 4px 24px -2px rgba(0, 0, 0, 0.3), 0 1px 2px 0 rgba(255, 255, 255, 0.05) inset',
        'card-hover': '0 12px 36px -4px rgba(0, 0, 0, 0.4), 0 1px 2px 0 rgba(255, 255, 255, 0.1) inset',
        'modal': '0 24px 64px -12px rgba(0, 0, 0, 0.7), 0 1px 2px 0 rgba(255, 255, 255, 0.12) inset',
        'glow':  '0 0 20px -3px rgba(34, 197, 94, 0.35)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.36), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
      },
      backdropBlur: {
        'xs': '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'apple': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      keyframes: {
        'enter': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'exit': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
        },
        'skeleton': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'queue-add': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'success-check': {
          '0%': { transform: 'scale(0) rotate(-45deg)', opacity: '0' },
          '60%': { transform: 'scale(1.2) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'progress': {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
      },
      animation: {
        'enter': 'enter 0.2s ease-out',
        'exit': 'exit 0.15s ease-in',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
        'queue-add': 'queue-add 0.25s ease-out',
        'success-check': 'success-check 0.3s ease-out',
        'toast-in': 'toast-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
