/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        uno: {
          red: '#ef4444',
          yellow: '#f59e0b',
          green: '#10b981',
          blue: '#3b82f6',
          wild: '#8b5cf6',
          dark: '#0f172a',
          surface: '#1e293b',
          card: '#182234',
          border: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(239, 68, 68, 0.3)',
        'glow-blue': '0 0 25px -5px rgba(59, 130, 246, 0.3)',
        'glow-green': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-yellow': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
