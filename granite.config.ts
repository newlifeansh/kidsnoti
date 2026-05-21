import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "kidsnoti",
  brand: {
    displayName: "알림장쏙",
    primaryColor: "#1B89DB",
    icon: "https://static.toss.im/appsintoss/35527/daea770f-75ce-4243-92d2-a5c798b4bcbe.png",
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
