import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#5a9bff',
          500: '#1d6dff',
          600: '#155fd9',
          700: '#0f4cad',
          800: '#0a3a85',
          900: '#082c66',
        },
      },
    },
  },
  plugins: [],
};
export default config;
