import { defineConfig } from "vite";

// Tauri v2 подгружает статический билд, dev-server крутится на 1420.
// clearScreen/lifecycle подстроены под tauri dev — так его логи не затираются.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
