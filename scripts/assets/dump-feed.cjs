const io = require("../../electron/asset-pack-io.js");
const fs = require("node:fs");
const base = "https://frameflow.worksuitecloud.com/library/feed/stable/";
const out = [];
const log = (...a) => out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
(async () => {
  const cat = await (await fetch(base + "catalog.json")).json();
  log("catalog keys", Object.keys(cat), "packs", cat.packs.length);
  const byType = {};
  for (const p of cat.packs) (byType[p.type] ??= []).push(p);
  log("types", Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])));
  const pick = [
    ...(byType.transitions ?? []).filter((p) => /fade|dissol/i.test(p.title + p.description)).slice(0, 2),
    ...(byType.transitions ?? []).slice(0, 1),
    ...(byType["text-templates"] ?? []).filter((p) => /caption/i.test(p.title)).slice(0, 1),
    ...(byType["text-templates"] ?? []).slice(0, 1),
    ...(byType["video-templates"] ?? []).slice(0, 1),
    ...(byType["text-animations"] ?? []).slice(0, 1),
  ];
  for (const p of pick) {
    log("\n=== PACK", p);
    for (const u of [p.thumbnailUrl, p.previewUrl].filter(Boolean)) {
      try { const abs = new URL(u, base + "catalog.json").toString(); const r = await fetch(abs); log("thumb", u, "->", abs, r.status, r.headers.get("content-type")); } catch (e) { log("thumb err", u, String(e)); }
    }
    try {
      const url = new URL(p.files, base + "catalog.json").toString();
      const r = await fetch(url);
      log("zip", url, r.status);
      if (!r.ok) { log(await r.text().then((t) => t.slice(0, 300))); continue; }
      const entries = io.readZip(Buffer.from(await r.arrayBuffer()));
      log("entries", entries.map((e) => e.name + ":" + e.data.length));
      for (const e of entries.filter((e) => /\.(ffx|fftemplate)$/.test(e.name)).slice(0, 2)) log("FILE", e.name, e.data.toString("utf8").slice(0, 6000));
    } catch (e) { log("zip err", String(e)); }
  }
  // thumbnails of the first 10 text-templates packs
  for (const p of (byType["text-templates"] ?? []).slice(0, 5)) log("tt thumb", p.id, p.thumbnailUrl, p.previewUrl);
  fs.mkdirSync("diag", { recursive: true });
  fs.writeFileSync("diag/out.txt", out.join("\n"));
})();
