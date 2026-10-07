/* =====================================================================
   DASHBOARD.JS  —  vult de kaarten met de laatste meting van elke feed
   ===================================================================== */

// Iconen in de <span data-icon="..."> en <div data-icon="..."> zetten
document.querySelectorAll("[data-icon]").forEach(el => el.innerHTML = icon(el.dataset.icon));

// Welke kaart toont welke feed, met hoeveel decimalen
const CARDS = [
  { id: "buitenTemp",   dec: 1 },
  { id: "vochtigheid",  dec: 0 },
  { id: "luchtdruk",    dec: 0 },
  { id: "gasweerstand", dec: 0 },
  { id: "windsnelheid", dec: 1 },
  { id: "neerslag",     dec: 1 },
  { id: "windrichting", dec: 0 },
];

async function refresh() {
  // Alle feeds tegelijk ophalen (zie getLastMany in common.js)
  const ids = feedIds();
  const data = await getLastMany(ids);

  // --- Sensor-kaarten ---
  CARDS.forEach(({ id, dec }) => {
    const card = document.getElementById(`s-${id}`);
    if (!card) return;
    const d = data[id];
    const unit = card.querySelector(".unit").outerHTML;
    card.querySelector(".value").innerHTML = (d ? fmt(d.value, dec) : "–") + unit;
    card.querySelector(".ago").textContent = d ? timeAgo(d.time) : "⚠️ geen data";
  });

  // --- Windrichting ---
  const wr = data.windrichting;
  const wrOk = wr && wr.value >= 0;
  document.getElementById("wind-dir").textContent =
    wrOk ? `${windName(wr.value)} (${Math.round(wr.value)}°)` : "Richting onbekend";
  document.getElementById("wind-dir-name").textContent = wrOk ? windName(wr.value) : "Onbekend";

  // --- Dakbedekking ---
  const g = data.groenDak, w = data.gewoonDak;
  document.getElementById("groenDak").textContent  = g ? `${fmt(g.value)}°C` : "–";
  document.getElementById("gewoonDak").textContent = w ? `${fmt(w.value)}°C` : "–";
  const gr = data.grijsDak;
  document.getElementById("grijsDak").textContent = gr ? `${fmt(gr.value)}°C` : "–";
  if (g && w) {
    const diff = w.value - g.value;
    document.getElementById("roof-note").innerHTML =
      Math.abs(diff) < 0.05 ? "Beide daken zijn nu even warm."
      : diff > 0 ? `Het groene dak is nu <b>${fmt(diff)} °C koeler</b> dan het gewone dak.`
                 : `Het groene dak is nu <b>${fmt(-diff)} °C warmer</b> dan het gewone dak.`;
    if (gr) {
      const d2 = gr.value - g.value;
      document.getElementById("roof-note").innerHTML += ` Het grijze dak is <b>${fmt(Math.abs(d2))} °C ${d2 >= 0 ? "warmer" : "koeler"}</b> dan het groene dak.`;
    }
  }

  // --- Systeemstatus ---
  // dbOk = kon de site de meetdatabase bereiken? (geen apart vakje meer, wel nodig voor de tekst hieronder)
  const dbOk = Object.keys(data).length > 0;

  // PICO VERBINDING = heeft de Pico de laatste X minuten nog iets gestuurd?
  const newest = Math.max(...Object.values(data).map(d => d.time.getTime()), 0);
  const picoOk = newest && (Date.now() - newest) < CONFIG.PICO_TIMEOUT_MIN * 60000;
  setStat("st-pico", picoOk, "ACTIEF", "NIET ACTIEF");

  const missing = ids.filter(id => !data[id]).map(id => CONFIG.FEEDS[id] + (isOptional(id) ? " (optioneel)" : ""));
  document.getElementById("st-meta").textContent =
    (newest ? `Laatste meting van de Pico: ${timeAgo(new Date(newest))}` : "Nog geen metingen ontvangen") +
    (missing.length && dbOk ? ` · ontbrekende feeds: ${missing.join(", ")}` : "");
}

function setStat(elId, ok, yes, no) {
  const el = document.getElementById(elId);
  el.textContent = ok ? yes : no;
  el.className = "v " + (ok ? "ok" : "bad");
}

refresh();
setInterval(refresh, CONFIG.REFRESH_SECONDS * 1000);
