/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1d1b19', soft: '#3b3733', muted: '#6f6a64' },
        stone: { 50: '#faf8f5', 100: '#f3efe9', 200: '#e7e0d6', 300: '#d6ccbe', 400: '#b8aa97', 500: '#968673' },
        brass: { DEFAULT: '#9a6b3c', dark: '#7c5530', light: '#c9a27a' },
        moss: '#4f6b4a',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(29,27,25,.06), 0 8px 24px -12px rgba(29,27,25,.18)' },
    },
  },
  plugins: [],
};
