/**
 * Fetch featured images for case studies from daneoleary.com.
 * Writes webp into public/assets/case-studies/<slug>.webp (masters untouched).
 *
 * Run: node scripts/fetch-case-study-images.mjs
 */
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/assets/case-studies");

const STUDIES = [
  { slug: "sad-trials", url: "https://daneoleary.com/web/sad-trials" },
  { slug: "312-truck", url: "https://daneoleary.com/web/312-truck" },
  { slug: "vedara-ventures", url: "https://daneoleary.com/web/vedara-ventures" },
  { slug: "nar-app", url: "https://daneoleary.com/ux/nar-app" },
  { slug: "schedually", url: "https://daneoleary.com/ux/schedually" }
];

function extractImageUrl(html, pageUrl) {
  const og =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
  if (og?.[1]) return new URL(og[1], pageUrl).href;

  const twitter =
    html.match(
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    );
  if (twitter?.[1]) return new URL(twitter[1], pageUrl).href;

  // Prefer large content images (skip icons / logos).
  const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
  for (const m of imgs) {
    const src = m[1];
    if (/logo|icon|avatar|sprite|emoji|1x1|pixel/i.test(src)) continue;
    if (/\.(svg)(\?|$)/i.test(src)) continue;
    try {
      return new URL(src, pageUrl).href;
    } catch {
      /* skip */
    }
  }
  return null;
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "portfolio2-0-case-study-image-fetch/1.0"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function toWebp(inputPath, outputPath) {
  // Prefer sharp via npx if available; fall back to sips+cwebp if needed.
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "sharp-cli@5.1.0",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--format",
      "webp",
      "--quality",
      "82"
    ],
    { stdio: "inherit" }
  );
  if (r.status === 0 && existsSync(outputPath)) return true;

  // Fallback: copy raw if already webp, else leave missing (UI uses gradient).
  console.warn("sharp-cli failed; trying magick/sips fallback");
  const magick = spawnSync(
    "magick",
    [inputPath, "-quality", "82", outputPath],
    { stdio: "inherit" }
  );
  return magick.status === 0 && existsSync(outputPath);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const study of STUDIES) {
  const outWebp = join(OUT_DIR, `${study.slug}.webp`);
  try {
    console.log("→", study.slug, study.url);
    const html = await (await fetch(study.url)).text();
    const imageUrl = extractImageUrl(html, study.url);
    if (!imageUrl) {
      console.warn("  no image found — skipping (gradient placeholder)");
      continue;
    }
    console.log("  image", imageUrl);
    const buf = await fetchBuffer(imageUrl);
    const ext = (imageUrl.split("?")[0].match(/\.(\w+)$/)?.[1] || "img").toLowerCase();
    const rawPath = join(OUT_DIR, `${study.slug}.src.${ext === "jpeg" ? "jpg" : ext}`);
    writeFileSync(rawPath, buf);
    const ok = toWebp(rawPath, outWebp);
    try {
      unlinkSync(rawPath);
    } catch {
      /* ignore */
    }
    if (ok) console.log("  wrote", outWebp);
    else console.warn("  convert failed — skipping");
  } catch (err) {
    console.warn("  failed:", err.message || err);
  }
}

console.log("done");
