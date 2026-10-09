# Weerstation Richtpunt campus Zottegem — website

Live metingen van het weerstation op **Richtpunt campus Zottegem**.
Live: https://rcz-thomasroelandt.github.io/weerstation-rcz/

Pure HTML, CSS en JavaScript (geen server nodig). Grafieken met Chart.js.

## Pagina's

| Pagina | Inhoud |
|---|---|
| `index.html` | Welkom, "Nu buiten" en trendgrafieken (24 uur, 7 dagen, 30 dagen) |
| `dashboard.html` | De laatste waarde van elke sensor, dakbedekking en status van de Pico |
| `over-ons.html` | Het team en het project |

## Mappen

| Map | Inhoud |
|---|---|
| `css/` | Opmaak (`style.css`) |
| `js/` | `config.js` (instellingen), `common.js` (ophalen van data), `home.js`, `dashboard.js` |
| `img/` | Logo |

Plus `favicon.*` en `apple-touch-icon.png` (het icoon in het tabblad).

## Instellen

Alle instellingen staan in `js/config.js`: de Adafruit-gebruikersnaam en de feed-keys.
`AIO_KEY` blijft **leeg**: alles op GitHub Pages is openbaar, dus de feeds in Adafruit IO staan op **Public**.

Meer uitleg (feeds, Pico, problemen oplossen) staat in de hoofd-README van het project.

Gemaakt door Xeno Becaus en Thomas Roelandt.
