/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans:    ['"Geist"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink:    '#0a0a0a',
        paper:  '#f5f3ee',
        accent: '#00ff9d',
        warn:   '#ff5b3a',
      },
    },
  },
  plugins: [],
};
