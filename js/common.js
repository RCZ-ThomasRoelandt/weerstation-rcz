/* =====================================================================
   COMMON.JS  —  gedeelde code voor alle pagina's
   (verbinding met Adafruit IO, demo-data, iconen, navigatie)
   Normaal hoef je hier niets aan te veranderen.
   ===================================================================== */

const DEMO = CONFIG.AIO_USERNAME === "JOUW_GEBRUIKERSNAAM";
const API = `https://io.adafruit.com/api/v2/${CONFIG.AIO_USERNAME}/feeds`;

/* ---------- Verzoek naar Adafruit IO ---------- */
async function aio(path) {
  const headers = {};
  if (CONFIG.AIO_KEY) headers["X-AIO-Key"] = CONFIG.AIO_KEY;
  const res = await fetch(`${API}/${path}`, { headers });
  // 404 = feed key klopt niet · 401/403 = feed is niet Public en er is geen key
  if (!res.ok) throw new Error(`${res.status} bij ${path}`);
  return res.json();
}

/* ---------- Laatste waarde van één feed ----------
   Geeft { value: getal, time: Date } terug.
   Let op: Adafruit IO's v2-API heeft GEEN "/data/last" endpoint (dat
   gaf altijd een 404, waardoor de vakjes leeg bleven terwijl de
   grafiek — die een ander, bestaand endpoint gebruikt — wel werkte).
   De juiste manier is "/data?limit=1": dat geeft een lijst van 1
   datapunt terug, het meest recente.                                */
async function getLast(id) {
  if (DEMO) return demoLast(id);
  const d = await aio(`${CONFIG.FEEDS[id]}/data?limit=1`);
  if (!Array.isArray(d) || !d.length) throw new Error(`Geen data voor feed "${CONFIG.FEEDS[id]}"`);
  return { value: parseFloat(d[0].value), time: new Date(d[0].created_at) };
}

/* ---------- Laatste waarde van MEERDERE feeds tegelijk ----------
   Geeft {id: {value,time}} terug; een feed die mislukt (of nog geen
   data heeft) ontbreekt gewoon in het resultaat, de rest wacht niet
   op elkaar — zo laadt de pagina zo snel mogelijk.                   */
async function getLastMany(ids) {
  const results = await Promise.allSettled(ids.map(getLast));
  const data = {};
  ids.forEach((id, i) => {
    if (results[i].status === "fulfilled") data[id] = results[i].value;
    else console.error(`Feed "${CONFIG.FEEDS[id]}":`, results[i].reason);
  });
  return data;
}

/* ---------- Historiek van één feed (voor grafieken) ----------
   Gebruikt Adafruit's "chart"-functie die gemiddelden per blok maakt.
   Geeft een lijst [{ t: Date, v: getal }, …] terug.                 */
async function getHistory(id, hours) {
  if (DEMO) return demoHistory(id, hours);
  // resolutie in minuten (toegelaten: 1, 5, 10, 30, 60, 120, 240, 480, 960)
  const res = hours <= 24 ? 30 : hours <= 168 ? 120 : 480;
  const d = await aio(`${CONFIG.FEEDS[id]}/data/chart?hours=${hours}&resolution=${res}`);
  const pts = d.data.map(([t, v]) => ({ t: new Date(t), v: parseFloat(v) }));
  if (pts.length >= 2) return pts;

  // Nieuwe of net gewiste feed: Adafruit heeft de gemiddelden nog niet
  // berekend (dat duurt soms een uur). Dan tonen we gewoon de ruwe metingen.
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const raw = await aio(`${CONFIG.FEEDS[id]}/data?start_time=${encodeURIComponent(since)}&limit=1000`);
  // in dezelfde tijdblokken groeperen als Adafruit, zodat alle lijnen netjes
  // op dezelfde tijdas staan (geen rechte stukken of losse punten)
  const blok = res * 60000, groepen = new Map();
  raw.forEach(r => {
    const ms = Math.floor(new Date(r.created_at).getTime() / blok) * blok;
    const v = parseFloat(r.value);
    if (isNaN(v)) return;
    const g = groepen.get(ms) || { som: 0, n: 0 };
    g.som += v; g.n++;
    groepen.set(ms, g);
  });
  return [...groepen.entries()].sort((a, b) => a[0] - b[0])
    .map(([ms, g]) => ({ t: new Date(ms), v: g.som / g.n }));
}

/* ---------- DEMO-data (zolang er geen gebruikersnaam is ingevuld) ---------- */
const DEMO_BASE = {
  buitenTemp: 24.6, vochtigheid: 34, luchtdruk: 976, gasweerstand: 12947,
  windsnelheid: 0, windrichting: 270, neerslag: 0,
  groenDak: 23.1, gewoonDak: 23.2, grijsDak: 23.6,
};
function demoLast(id) {
  return { value: DEMO_BASE[id], time: new Date(Date.now() - 40000) };
}
function demoHistory(id, hours) {
  const n = hours <= 24 ? 48 : hours <= 168 ? 84 : 90;
  const step = hours * 3600000 / n, out = [];
  for (let i = n; i >= 0; i--) {
    const t = new Date(Date.now() - i * step);
    const day = Math.sin((t.getHours() + t.getMinutes() / 60 - 9) / 24 * 2 * Math.PI);
    const noise = Math.sin(i * 1.7) * 0.4 + Math.sin(i * 0.31) * 0.8;
    let v = DEMO_BASE[id];
    if (id === "buitenTemp")  v = 17 + day * 6 + noise;
    if (id === "groenDak")    v = 18 + day * 3.5 + noise * 0.6;
    if (id === "gewoonDak")   v = 18 + day * 8 + noise;
    if (id === "grijsDak")    v = 18 + day * 6 + noise * 0.8;
    if (id === "gasweerstand")v = 12000 + Math.sin(i * 0.2) * 1500 + noise * 200;
    if (id === "windrichting")v = [180, 225, 270, 270, 315][Math.abs(Math.round(i / 6)) % 5];
    if (id === "vochtigheid") v = 60 - day * 20 + noise * 3;
    if (id === "luchtdruk")   v = 1008 + Math.sin(i / n * 5) * 7 + noise;
    if (id === "windsnelheid")v = Math.max(0, 8 + Math.sin(i * 0.9) * 6 + noise * 3);
    if (id === "neerslag")    v = (i % 17 < 3) ? Math.abs(noise) * 1.5 : 0;
    out.push({ t, v: Math.round(v * 10) / 10 });
  }
  return out;
}

/* ---------- Feeds die de site ophaalt (optionele feeds alleen als ingevuld) ---------- */
function feedIds() { return Object.keys(CONFIG.FEEDS).filter(id => CONFIG.FEEDS[id]); }
function isOptional(id) { return (CONFIG.OPTIONAL || []).includes(id); }

/* ---------- Hulpjes ---------- */
function windName(deg) {
  if (deg == null || isNaN(deg) || deg < 0) return "Onbekend";
  const names = ["Noorden", "Noordoosten", "Oosten", "Zuidoosten",
                 "Zuiden", "Zuidwesten", "Westen", "Noordwesten"];
  return names[Math.round(((deg % 360) / 45)) % 8];
}
function fmt(v, dec = 1) {
  return (v == null || isNaN(v)) ? "–" : v.toFixed(dec);
}
function timeAgo(date) {
  const s = Math.round((Date.now() - date) / 1000);
  if (s < 60) return `${s} sec geleden`;
  if (s < 3600) return `${Math.round(s / 60)} min geleden`;
  if (s < 86400) return `${Math.round(s / 3600)} uur geleden`;
  return date.toLocaleString("nl-BE");
}

/* ---------- Iconen (Lucide, MIT-licentie) ---------- */
const ICONS = {
  thermo:   '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  drops:    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  gauge:    '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  flask:    '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  wind:     '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  rain:     '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
  leaf:     '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  compass:  '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  cpu:      '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  trend:    '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/* ---------- Navigatie + demo-melding (op elke pagina) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(a => {
    if (a.getAttribute("href") === here) a.classList.add("active");
  });
  const burger = document.querySelector(".burger");
  if (burger) burger.onclick = () => document.querySelector(".nav").classList.toggle("open");

  if (DEMO) {
    const b = document.createElement("div");
    b.className = "demo-banner";
    b.innerHTML = "DEMO-modus: vul je gebruikersnaam in <code>js/config.js</code> in voor echte metingen.";
    document.body.prepend(b);
  }
});
