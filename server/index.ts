import "dotenv/config";
import express from "express";
import routes from "./routes/index.js";
import { setupVite, serveStatic } from "./vite.js";

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled rejection:", reason);
});

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const isDev = process.env.NODE_ENV !== "production";
const enableApiTiming = process.env.API_TIMING_LOG === "true";

app.use(express.json());
if (enableApiTiming) {
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api/")) return;
      const ms = Date.now() - t0;
      console.log(`[api] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
}

// Mount API routes
app.use(routes);

// Vite dev server or static serving
if (isDev) {
  await setupVite(app);
} else {
  serveStatic(app);
}

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT} (${isDev ? "dev" : "production"})`);
});
