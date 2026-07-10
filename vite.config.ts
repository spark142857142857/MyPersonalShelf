import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "macos" ? "safari16" : "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
