/** Pass K — one-line summary of a pass-k-land score.json (and time-to-Enter if logged). */
import { readFileSync, existsSync } from "node:fs";
for (const label of process.argv.slice(2)) {
  const p = `tmp/pass-k/${label}/score.json`;
  if (!existsSync(p)) { console.log(label, "missing"); continue; }
  const s = JSON.parse(readFileSync(p, "utf8"));
  const f = (w) => `${w.over50}/${w.over33} (n=${w.frames}, resizes ${w.resizes.length}, worst ${w.worst.slice(0, 3).map((r) => `${Math.round(r[1])}${r[4] ? "e" : ""}:${r[3]}`).join(" ")})`;
  const pace = s.pacing?.perStop ? Object.entries(s.pacing.perStop).map(([k, v]) => `${k}:${v.pacedS}/${v.uncappedS}`).join(" ") : "";
  console.log(`${label.padEnd(22)} pace(paced/uncapped s) ${pace}`);
  console.log(`${label.padEnd(22)} enter ${s.enterMs != null ? (s.enterMs / 1000).toFixed(1) + "s" : "?"}  land ${f(s.landWindow)}  sidekick ${f(s.sidekickWindow)}`);
}
