import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.brandonhenes.theedge",
  appName: "The Edge",
  webDir: "dist/public",
  server: {
    url: "https://sleeperfordaddy.onrender.com",
    cleartext: false,
  },
  android: {
    backgroundColor: "#0b1020",
  },
};

export default config;
