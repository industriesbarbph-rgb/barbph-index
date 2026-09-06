import fs from "node:fs/promises";

const REGISTRY_URL = "https://seohealth.barbph.com/.netlify/functions/public-registry";
const INDEX_PATH = "index.html";
const DYNAMIC_START = "<!-- BARBPH INDEX DYNAMIC DIRECTORY START -->";
const DYNAMIC_END = "<!-- BARBPH INDEX DYNAMIC DIRECTORY END -->";

const bakedUrls = new Set([
  "https://barbph.com/",
  "https://ikl.barbph.com/",
  "https://watchtower.barbph.com/",
  "https://willwheelreadme.barbph.com/",
  "https://janafordemo.barbph.com/",
  "https://ourbible.barbph.com/",
  "https://pendantlounge.barbph.com/",
  "https://duplitron526.barbph.com/",
  "https://comscie-it-map.barbph.com/",
  "https://greenforest.barbph.com/",
  "https://nightsky.barbph.com/",
  "https://redroses.barbph.com/",
  "https://joyfulprism.barbph.com/",
  "https://vines.barbph.com/",
  "https://cloudsandstars.barbph.com/",
  "https://thelunarosa-sot.barbph.com/",
  "https://orangeengine.barbph.com/",
  "https://thesecondfloormarketplace.barbph.com/",
  "https://theorb.barbph.com/",
  "https://nohumanconversation.barbph.com/"
]);

const norm = value => {
  const u = new URL(value);
  u.hash = "";
  if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.href;
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

async function fetchRegistry() {
  try {
    const r = await fetch(REGISTRY_URL, { headers: { "user-agent": "BarbPH-Index-Static-Sync/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      console.log(`Console registry not ready (HTTP ${r.status}); keeping current Index unchanged.`);
      return null;
    }
    const data = await r.json();
    return Array.isArray(data?.properties) ? data.properties.filter(p => p?.published !== false && /^https?:\/\//i.test(String(p?.url || ""))) : [];
  } catch (e) {
    console.log(`Console registry unavailable (${e?.message || e}); keeping current Index unchanged.`);
    return null;
  }
}

function dynamicHtml(rows, startPosition) {
  if (!rows.length) return `${DYNAMIC_START}\n      ${DYNAMIC_END}`;
  return `${DYNAMIC_START}\n${rows.map((p, i) => `      <article class="index-entry" data-source="seo-health-console-registry">
        <div class="entry-heading">
          <span class="entry-number" aria-hidden="true">${String(startPosition + i).padStart(2, "0")}</span>
          <h3><a href="${esc(p.url)}">${esc(p.name || new URL(p.url).hostname)}</a></h3>
          <span class="entry-type">${esc(p.category || p.kind || "Digital Product")}</span>
        </div>
        <p class="entry-description">A BarbPH digital product registered through the BarbPH SEO Health Console.</p>
        <p class="entry-url">${esc(p.url)}</p>
      </article>`).join("\n\n")}\n      ${DYNAMIC_END}`;
}

function replaceDynamicBlock(html, block) {
  const re = new RegExp(`${DYNAMIC_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${DYNAMIC_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (re.test(html)) return html.replace(re, block);
  const anchor = "    </section>\n    <!-- BARBPH INDEX DIRECTORY END -->";
  if (!html.includes(anchor)) throw new Error("Could not locate BarbPH Index directory end marker.");
  return html.replace(anchor, `\n      ${block}\n    </section>\n    <!-- BARBPH INDEX DIRECTORY END -->`);
}

function updateJsonLd(html, rows) {
  const re = /<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  if (!m) throw new Error("BarbPH Index JSON-LD block not found.");
  const data = JSON.parse(m[1]);
  const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [];
  const itemList = graph.find(x => x?.["@type"] === "ItemList");
  if (!itemList) throw new Error("BarbPH Index ItemList JSON-LD node not found.");
  itemList.numberOfItems = rows.length;
  itemList.itemListElement = rows.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: String(p.name || new URL(p.url).hostname), url: String(p.url) }));
  const pretty = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return html.replace(re, `<script type="application/ld+json">\n${pretty}\n  </script>`);
}

const registry = await fetchRegistry();
if (!registry) process.exit(0);

const seen = new Set();
const rows = [];
for (const p of registry) {
  let key;
  try { key = norm(p.url); } catch { continue; }
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({ ...p, url: key });
}

const baked = rows.filter(p => bakedUrls.has(p.url));
const dynamic = rows.filter(p => !bakedUrls.has(p.url));
if (baked.length < 20) {
  console.log(`Registry returned only ${baked.length}/20 baked products; refusing to rewrite the Index.`);
  process.exit(0);
}

let html = await fs.readFile(INDEX_PATH, "utf8");
html = replaceDynamicBlock(html, dynamicHtml(dynamic, 21));
html = updateJsonLd(html, [...baked, ...dynamic]);
await fs.writeFile(INDEX_PATH, html);
console.log(`BarbPH Index synchronized: ${baked.length} baked + ${dynamic.length} user-added = ${baked.length + dynamic.length} entries.`);
