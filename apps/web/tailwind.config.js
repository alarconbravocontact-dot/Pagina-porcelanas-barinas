/** @type {import('tailwindcss').Config} */
// Paleta "galería de porcelana": muros blancos, grises fríos y tinta grafito.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#262626', soft: '#4a4a4a', muted: '#8a8a8a' },
        stone: { 50: '#fafafa', 100: '#f4f4f3', 200: '#e8e8e6', 300: '#d6d6d3', 400: '#a8a8a5', 500: '#787876' },
        brass: { DEFAULT: '#6b6b69', dark: '#3d3d3c', light: '#c9c9c6' },
        moss: '#5f6b62',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: { card: 'none', gallery: '0 30px 60px -40px rgba(0,0,0,.25)' },
      letterSpacing: { gallery: '0.28em' },
      keyframes: {
        'tour-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'tour-ring': { '0%': { boxShadow: '0 0 0 0 rgba(255,255,255,.75)' }, '100%': { boxShadow: '0 0 0 14px rgba(255,255,255,0)' } },
      },
      animation: {
        'tour-in': 'tour-in .45s cubic-bezier(.2,.7,.2,1) both',
        'tour-ring': 'tour-ring 1.6s ease-out .5s 3',
      },
    },
  },
  plugins: [],
};
