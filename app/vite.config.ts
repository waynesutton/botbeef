import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// BUILD_ID (set by scripts/deploy.mjs) makes every deploy's asset URLs new, so an edge-cached 404 from a
// mid-deploy request can never stick to a URL the live shell points at.
const id = process.env.BUILD_ID ? `-${process.env.BUILD_ID}` : "";
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { entryFileNames: `assets/[name]-[hash]${id}.js`, chunkFileNames: `assets/[name]-[hash]${id}.js`, assetFileNames: `assets/[name]-[hash]${id}[extname]` } } },
});
