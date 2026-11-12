import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 跨源隔离是 SharedArrayBuffer（M2 起的 SAB ringbuf 参数通道）的前提。
// 生产环境需在托管侧配置同样的两个响应头（见 public/_headers）。
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  worker: {
    format: "es",
  },
});
