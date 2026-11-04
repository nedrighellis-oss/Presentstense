// Builds a deployable site in ./dist from index.html:
//   dist/index.html                     the gift finder
//   dist/<guide-slug>/index.html        one crawlable SEO page per gift guide
//   dist/sitemap.xml, dist/robots.txt
//   netlify/functions/gift-match.mjs    AI endpoint (your Anthropic key stays server-side)
// Usage: node build.mjs https://yourdomain.com
import fs from "node:fs";
import vm from "node:vm";

const SITE = (process.argv[2] || "https://example.com").replace(/\/$/, "");
const src = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const [headPart, bodyPart] = src.split("<!-- BODY -->");
const style = headPart.match(/<style>[\s\S]*?<\/style>/)[0];
const fonts = headPart.match(/<link rel="preconnect"[^>]*>\s*<link rel="stylesheet"[^>]*>/)[0];
const js = src.match(/<script>([\s\S]*)<\/script>/)[1];
const dataSrc = js.slice(js.indexOf("// DATA-START"), js.indexOf("// DATA-END"));
const scoreSrc = js.slice(js.indexOf("// ---------- scoring"), js.indexOf("function parseText"));
const promptSrc = js.slice(js.indexOf("function aiPrompt"), js.indexOf("async function aiMatch"));

const ctx = {};
vm.createContext(ctx);
vm.runInContext(dataSrc + scoreSrc + ";this.D={G,GUIDES,BUDGET,AFFILIATE_TAG,SITE_NAME,score};", ctx);
const { G, GUIDES, AFFILIATE_TAG, SITE_NAME, score } = ctx.D;
const link = q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AFFILIATE_TAG}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const year = new Date().getFullYear();

const doc = (title, desc, canonical, body, extraHead = "") => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${canonical}">
${fonts}
${style}
${extraHead}
</head><body>
${body}
</body></html>`;

const out = new URL("./dist/", import.meta.url);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1) Finder page
let finderBody = bodyPart
  .replace('href="#stocking-stuffers"', 'href="/stocking-stuffers/"')
  .replace("<script>", "<script>window.STATIC_GUIDES=true;");
fs.writeFileSync(new URL("index.html", out), doc(
  `${SITE_NAME}: Christmas Gift Finder`,
  "Describe the person or take a 20-second quiz and get Christmas gift ideas that actually fit them.",
  `${SITE}/`, finderBody));

// 2) Guide pages
const band = `<header class="band"><div class="in"><div class="top">
<a class="brand" href="/">Presents <em>Tense</em></a>
<nav aria-label="Main"><a href="/">Gift finder</a><a href="/#guides">Gift guides</a><a href="/stocking-stuffers/">Stocking stuffers</a></nav>
</div></div></header><div class="ribbon" aria-hidden="true"></div>`;
const foot = `<footer><div class="in"><span>As an Amazon Associate, ${SITE_NAME} earns from qualifying purchases. Prices are typical ranges and change often.</span><span><a href="/#feedback" style="color:inherit">Send feedback</a> · © ${year} ${SITE_NAME}</span></div></footer>`;

for (const g of GUIDES) {
  const res = score(g.q, { guide: true, limit: 12 });
  const others = GUIDES.filter(x => x !== g);
  const items = res.map(r => G[r.id]);
  const ld = { "@context": "https://schema.org", "@type": "ItemList", name: g.title,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0] })) };
  const body = `${band}
<main><div class="in"><article class="gwrap">
<div class="crumb"><a href="/#guides">Gift guides</a> / ${esc(g.nav)}</div>
<h1>${esc(g.h1)}</h1>
<p class="lede">${esc(g.intro)}</p>
<div class="meta">Updated for Christmas ${year} · ${items.length} picks</div>
<ol class="rank">${items.map(([name, price, , , , blurb, query]) => `<li><div><h3>${esc(name)}</h3><p>${esc(blurb)}</p></div><div class="side"><span class="price">~$${price}</span><a class="buy" href="${link(query)}" target="_blank" rel="noopener sponsored">See it ↗</a></div></li>`).join("\n")}</ol>
<div class="cta"><p><b>Not quite them?</b> Describe the person in a sentence and we'll match gifts to their actual personality.</p><a href="/">Try the gift finder</a></div>
<h2 class="sec-h">More gift guides</h2>
<div class="glist">${others.map(o => `<a href="/${o.slug}/"><b>${esc(o.h1)}</b></a>`).join("")}</div>
</article></div></main>
${foot}`;
  fs.mkdirSync(new URL(`${g.slug}/`, out), { recursive: true });
  fs.writeFileSync(new URL(`${g.slug}/index.html`, out),
    doc(`${g.title} | ${SITE_NAME}`, g.intro, `${SITE}/${g.slug}/`, body,
      `<script type="application/ld+json">${JSON.stringify(ld)}</script>`));
}

// 3) Sitemap + robots
const urls = ["/", ...GUIDES.map(g => `/${g.slug}/`)];
fs.writeFileSync(new URL("sitemap.xml", out), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(new URL("robots.txt", out), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

// 4) AI function: the prompt is built server-side so your key can't be used as a free proxy
fs.mkdirSync(new URL("./netlify/functions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./netlify/functions/gift-match.mjs", import.meta.url), `// Generated by build.mjs. Set ANTHROPIC_API_KEY in Netlify > Site settings > Environment variables.
const G = ${JSON.stringify(G.map(g => [g[0], g[1], g[2], g[3]]))};
${promptSrc}
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let description = "";
  try { description = String((await req.json()).description || "").trim(); } catch {}
  if (description.length < 3 || description.length > 900) return new Response("Bad request", { status: 400 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.GIFT_MODEL || "claude-haiku-5-5", max_tokens: 900,
      messages: [{ role: "user", content: aiPrompt(description) }] }),
  });
  if (!r.ok) return new Response("Upstream error", { status: 502 });
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return Response.json({ text });
};
export const config = { path: "/api/gift-match" };
`);

console.log(`Built ${urls.length} pages for ${SITE}`);
