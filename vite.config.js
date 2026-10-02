import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { finalizeFogConfig } from "./scripts/fog-tuner-finalize.mjs";
import { finalizeEdgeGlitchConfig } from "./scripts/edge-glitch-tuner-finalize.mjs";
import { finalizeWaterCursorRimConfig } from "./scripts/water-cursor-rim-tuner-finalize.mjs";
import { finalizeLawnEdgeConfig } from "./scripts/lawn-edge-tuner-finalize.mjs";
import { finalizeAccentConfig } from "./scripts/accent-tuner-finalize.mjs";
import { finalizeWetFloorConfig } from "./scripts/wet-floor-tuner-finalize.mjs";

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

/** Dev-only: EdgeGlitchTuner FINALIZE → PATCH edgeGlitch/constants.js. */
function edgeGlitchFinalizePlugin() {
  return {
    name: "edge-glitch-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__edge_glitch_finalize", async (req, res) => {
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
          const result = finalizeEdgeGlitchConfig(params, {
            label: body.label ?? "finalize"
          });
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

/** Dev-only: WaterCursorRimTuner FINALIZE → PATCH waterCursorRimConfig.js. */
function waterCursorRimFinalizePlugin() {
  return {
    name: "water-cursor-rim-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__water_cursor_rim_finalize", async (req, res) => {
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
          const result = finalizeWaterCursorRimConfig(params, {
            label: body.label ?? "finalize"
          });
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

/** Dev-only: LawnEdgeTuner FINALIZE → PATCH lawnEdgeConfig.js. */
function lawnEdgeFinalizePlugin() {
  return {
    name: "lawn-edge-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__lawn_edge_finalize", async (req, res) => {
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
          const result = finalizeLawnEdgeConfig(params, {
            label: body.label ?? "finalize"
          });
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

function accentFinalizePlugin() {
  return {
    name: "accent-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__accent_finalize", async (req, res) => {
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
          const result = finalizeAccentConfig(params, {
            label: body.label ?? "finalize"
          });
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

function wetFloorFinalizePlugin() {
  return {
    name: "wet-floor-tuner-finalize",
    configureServer(server) {
      server.middlewares.use("/__wet_floor_finalize", async (req, res) => {
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
          const result = finalizeWetFloorConfig(params, {
            label: body.label ?? "finalize"
          });
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

/**
 * Commit the running worker bundle was built from — read once at Vite
 * startup (dev server boot / production build), not per-request, so
 * restarting the dev server after a `git pull` is what actually refreshes
 * it. `debugVersion()` surfaces this so a stale worker (cached bundle, a
 * dev server that hasn't picked up the latest commit) is a one-line check
 * instead of a guess.
 */
function readBuildCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(readBuildCommit())
  },
  plugins: [
    fogFinalizePlugin(),
    edgeGlitchFinalizePlugin(),
    waterCursorRimFinalizePlugin(),
    lawnEdgeFinalizePlugin(),
    accentFinalizePlugin(),
    wetFloorFinalizePlugin()
  ],
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
