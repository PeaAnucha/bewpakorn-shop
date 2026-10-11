/** สีและฟอนต์อิงจาก UI เดิม (ธีมมืด + accent เขียว) */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a18', surface: '#12121f', s2: '#1a1a2e', s3: '#22223a', s4: '#2a2a46',
        line: '#2e2e50', line2: '#3d3d65',
        accent: '#10b981', orange: '#ff9142', green: '#3ecf6e', danger: '#ff5c7a', warn: '#ffc845', info: '#4fc3f7',
        ink: '#dde0ff', mute: '#8a8ab8', faint: '#4e4e78',
      },
      fontFamily: { sans: ['Sarabun', 'sans-serif'], head: ['Prompt', 'sans-serif'] },
    },
  },
  plugins: [],
};
