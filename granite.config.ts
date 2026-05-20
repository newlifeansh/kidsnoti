import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "kids-notice-ait",
  brand: {
    displayName: "알림장쏙",
    primaryColor: "#1B89DB",
    icon: "/icon.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
