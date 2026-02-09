import "dotenv/config";
import express from "express";
import routes from "./routes/index.js";
import { setupVite, serveStatic } from "./vite.js";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const isDev = process.env.NODE_ENV !== "production";

app.use(express.json());

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
