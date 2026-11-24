import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// แยกไลบรารีที่ไม่ค่อยเปลี่ยนออกเป็นไฟล์ของตัวเอง หลัง deploy รอบใหม่เบราว์เซอร์จะใช้ไฟล์ไลบรารีเดิมจากแคช
// และโหลดใหม่เฉพาะโค้ดของแอปที่เปลี่ยน (ไลบรารีที่โหลดแบบ dynamic เช่น three/liquidglass/dnd-kit แยกไฟล์อยู่แล้ว)
const VENDOR_CHUNKS: [string, RegExp][] = [
  ['vendor-react', /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/],
  ['vendor-supabase', /[\\/]node_modules[\\/](@supabase|iceberg-js|tslib)[\\/]/],
  ['vendor-query', /[\\/]node_modules[\\/]@tanstack[\\/]/],
];

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0];
        },
      },
    },
  },
});
