/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        uno: {
          red: '#e03131',
          yellow: '#f59f00',
          green: '#2f9e44',
          blue: '#1971c2',
          wild: '#7048e8',
          dark: '#0c1017',
          surface: '#151b26',
          card: '#1b2331',
          border: '#2a3447',
        },
        felt: {
          dark: '#081710',
          DEFAULT: '#0d281a',
          light: '#133924',
          rail: '#18472d',
          accent: '#1e5a38',
        },
        brass: {
          dark: '#8c6b2d',
          DEFAULT: '#b89047',
          light: '#d4af62',
          pale: '#ebd59b',
        },
        table: {
          rim: '#181e29',
          edge: '#11151d',
          rail: '#202837',
        },
        surface: {
          canvas: '#090c10',
          panel: '#111620',
          card: '#161c28',
          elevated: '#1d2535',
          highlight: '#252f43',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 2px 6px -1px rgba(0, 0, 0, 0.4)',
        'card-elevated': '0 12px 32px -4px rgba(0, 0, 0, 0.65), 0 4px 12px -2px rgba(0, 0, 0, 0.45)',
        table: '0 20px 60px -10px rgba(0, 0, 0, 0.85), inset 0 0 80px rgba(0, 0, 0, 0.75)',
        modal: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        brass: '0 2px 10px rgba(184, 144, 71, 0.25)',
        glow: '0 0 20px -3px rgba(224, 49, 49, 0.25)',
        'glow-blue': '0 0 20px -3px rgba(25, 113, 194, 0.25)',
        'glow-green': '0 0 20px -3px rgba(47, 158, 68, 0.25)',
        'glow-yellow': '0 0 20px -3px rgba(245, 159, 0, 0.25)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
