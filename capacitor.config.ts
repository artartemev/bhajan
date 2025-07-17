// File: capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bhajan.sangam',
  appName: 'BhajanSangam',
  // webDir: 'out' // <-- УДАЛЯЕМ ЭТУ СТРОКУ
  // ДОБАВЛЯЕМ СЕКЦИЮ server
  server: {
    url: 'http://10.3.21.22:3000', // Например: 'http://192.168.1.5:3000'
    cleartext: true
  }
};

export default config;