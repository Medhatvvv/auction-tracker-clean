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
        app:      '#fafafa',     // page bg
        surface:  '#ffffff',     // cards
        ink:      '#0f172a',     // primary text
        muted:    '#64748b',     // secondary text
        line:     '#e5e7eb',     // borders
        accent:   '#4f46e5',     // indigo
        positive: '#059669',     // emerald (live / current bid)
        warn:     '#dc2626',     // red
      },
    },
  },
  plugins: [],
};
