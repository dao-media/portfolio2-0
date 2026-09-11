import { resolve } from "node:path";
import { defineConfig } from "vite";
import { finalizeFogConfig } from "./scripts/fog-tuner-finalize.mjs";

/** Dev-only: FogTuner FINALIZE → PATCH src/fog/fogConfig.js schema defaults. */
function fogFinalizePlugin() {
  return {
    name: "fog-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__fog_finalize", async (req, res, next) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const params = body.params ?? body;
          const result = finalizeFogConfig(params, { label: body.label ?? "finalize" });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [fogFinalizePlugin()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        sidekickSms: resolve(__dirname, "sidekick-sms.html"),
        fogLab: resolve(__dirname, "fog-lab.html")
      }
    }
  }
});
