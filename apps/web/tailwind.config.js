/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        uno: {
          red: '#d9383a',
          yellow: '#e5a519',
          green: '#2b8a47',
          blue: '#2368a2',
          wild: '#495057',
          dark: '#0a0d13',
          surface: '#11151e',
          card: '#161b26',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        felt: {
          dark: '#06130b',
          DEFAULT: '#0a2216',
          light: '#0e2c1d',
          rail: '#143825',
          accent: '#1b4a31',
        },
        brass: {
          dark: '#87672b',
          DEFAULT: '#b89047',
          light: '#d4af62',
          pale: '#ebd59b',
        },
        table: {
          rim: '#151a24',
          edge: '#0d1017',
          rail: '#1c2230',
        },
        surface: {
          canvas: '#090c11',
          panel: '#10141d',
          card: '#151a24',
          elevated: '#1a202d',
          highlight: '#222a3a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 3px 12px -2px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.35)',
        'card-elevated': '0 8px 24px -4px rgba(0, 0, 0, 0.65), 0 2px 6px -1px rgba(0, 0, 0, 0.45)',
        table: '0 24px 64px -12px rgba(0, 0, 0, 0.9), inset 0 0 90px rgba(0, 0, 0, 0.8)',
        modal: '0 24px 48px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        brass: '0 1px 3px rgba(184, 144, 71, 0.2), 0 0 0 1px rgba(184, 144, 71, 0.25)',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)',
        unslop: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [],
};
