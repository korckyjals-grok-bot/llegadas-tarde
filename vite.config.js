import { defineConfig } from "vite";

export default defineConfig({
  base: "/llegadas-tarde/",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 43123,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 43123,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
