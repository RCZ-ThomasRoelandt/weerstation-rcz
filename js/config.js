/* =====================================================================
   CONFIG.JS  —  👉 HIER KOPPEL JE JE ADAFRUIT IO ACCOUNT
   =====================================================================
   Dit is het ENIGE bestand van de website dat je moet aanpassen.

   1. Log in op https://io.adafruit.com
   2. Klik op het gele sleutel-icoon ("My Key") → daar staat je Username.
   3. Maak in Adafruit IO de 10 feeds aan met EXACT de keys hieronder
      (Feeds → New Feed). Kijk bij elke feed naar "Key", niet naar "Name".

   ⚠️ Gratis Adafruit IO = maximaal 10 feeds. Dit project gebruikt precies 10 feeds.

   Zolang AIO_USERNAME op "JOUW_GEBRUIKERSNAAM" staat, toont de site
   DEMO-data, zodat je het ontwerp al kan bekijken.
   ===================================================================== */

const CONFIG = {

  // 👉 1. Je Adafruit IO gebruikersnaam
  AIO_USERNAME: "XenoBecaus",

  // 👉 2. Je Adafruit IO key: LAAT DIT LEEG ("")!
  //    Alles op GitHub Pages is openbaar. Zet in Adafruit IO je feeds op
  //    "Public" (feed → ⚙️ → Privacy → Public). Dan heeft de site geen key nodig.
  //    De key hoort ALLEEN in de Pico-code (pico/secrets.py).
  AIO_KEY: "",

  // 👉 3. Feed keys: links de naam die de site gebruikt, rechts de key in Adafruit IO.
  //    Pas enkel de RECHTERKANT aan als jouw feeds anders heten.
  FEEDS: {
    buitenTemp:    "buiten-temp",       // °C   – buitentemperatuur (hoofdsensor)
    vochtigheid:   "luchtvochtigheid",  // %    – BME688
    luchtdruk:     "luchtdruk",         // hPa  – BME688
    gasweerstand:  "gasweerstand",      // kΩ   – BME688 (luchtkwaliteit)
    windsnelheid:  "windsnelheid",      // km/u – anemometer
    windrichting:  "windrichting",      // °    – windvaan (0 = N, 90 = O, 180 = Z, 270 = W)
    neerslag:      "neerslag",          // mm   – regenmeter (totaal vandaag)
    groenDak:      "groen-dak",         // °C   – temperatuur onder het groene dak
    gewoonDak:     "gewoon-dak",        // °C   – temperatuur onder het gewone dak
    grijsDak:      "grijs-dak",         // °C   – temperatuur onder het grijze dak
  },

  // Feeds die mogen ontbreken zonder foutmelding (nu: geen, alle 10 zijn nodig).
  OPTIONAL: [],

  // Na hoeveel minuten zonder nieuwe data "Pico link" op NIET ACTIEF springt
  PICO_TIMEOUT_MIN: 5,

  // Hoe vaak het dashboard nieuwe data ophaalt (seconden).
  // Gratis Adafruit IO: max 30 verzoeken/minuut → 10 feeds elke 60 s is veilig.
  REFRESH_SECONDS: 60,
};
