// File: capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bhajan.sangam',
  appName: 'BhajanSangam',
  // ✅ УКАЗЫВАЕМ ПАПКУ С ГОТОВЫМ САЙТОМ
  webDir: 'out'
};

export default config;