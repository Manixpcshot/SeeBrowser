import { defineConfig } from "vite";

// Vite config tuned for Tauri (fixed port, no clearing of Rust logs) and for
// running the browser UI in "demo mode" inside a normal web browser.
export default defineConfig({
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: { host: "0.0.0.0", port: 4173 },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
