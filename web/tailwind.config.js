/** ธีม Green Deck: มืดเป็นหลัก ใช้สีเขียวเป็นจุดเน้นเฉพาะปุ่ม/สถานะ ยกระดับพื้นผิวด้วยความสว่างแทนเส้นขอบ */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#121212', surface: '#181818', sidebar: '#000000',
        s2: '#282828', s3: '#333333', s4: '#3d3d3d',
        line: '#282828', line2: '#3d3d3d',
        accent: '#1DB954', 'accent-hover': '#1ED760', green: '#1DB954',
        orange: '#F59B23', warn: '#F59B23', danger: '#E22134', info: '#4fc3f7',
        ink: '#FFFFFF', mute: '#D0D0D0', faint: '#A8A8A8',
      },
      // DM Sans ไม่มีตัวอักษรไทย จึงจับคู่กับ Noto Sans Thai (ตัวละตินใช้ DM Sans)
      fontFamily: {
        sans: ['"DM Sans"', '"Noto Sans Thai"', 'sans-serif'],
        head: ['"DM Sans"', '"Noto Sans Thai"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
