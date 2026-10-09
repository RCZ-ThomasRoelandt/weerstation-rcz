# =====================================================================
#  MAIN.PY — Raspberry Pi Pico W (MicroPython) -> Adafruit IO
#  AANGEPAST voor JULLIE echte, geteste hardware:
#    BMP280 (SPI0) + BME688 (I2C) + 3x DS18B20 (dakensensoren)
#    + windmeter + regenmeter + windvaan (ADC)
#  Stuurt exact de 10 feeds die de website (js/config.js) verwacht.
# =====================================================================
#  Bestanden op de Pico (via Thonny -> Bestand -> Opslaan als -> Raspberry Pi Pico):
#    main.py       (dit bestand)
#    secrets.py    (wifi + Adafruit gegevens - AL INGEVULD, zie hieronder)
#    bmp280_spi.py (driver voor de BMP280, die jullie al gebruiken)
#    bme680.py     (driver voor de BME688, die jullie al gebruiken)
#    sdcard.py     (driver voor de SD-kaart, die jullie al gebruiken)
#
#  AANSLUITINGEN (zoals in jullie bestaande, geteste code):
#    BMP280 (SPI0)   CS=GP17  SCK=GP18  MOSI=GP19  MISO=GP16
#    BME688 (I2C0)   SDA=GP4  SCL=GP5
#    DS18B20 (x3)    DATA=GP14  (groen dak / gewoon dak / grijs dak)
#    SD-kaart (SPI1) CS=GP13  SCK=GP10  MOSI=GP11  MISO=GP12
#    Windmeter       GP15 (pulsen, interrupt)
#    Regenmeter      GP6  (pulsen, interrupt)
#    Windvaan        GP26 (ADC0)
# =====================================================================

import time, network, urequests, onewire, ds18x20, bme680, bmp280_spi, sdcard, uos, ntptime
from machine import Pin, SPI, ADC, I2C
import secrets

# ---------- FEED KEYS (moeten EXACT gelijk zijn aan js/config.js) ----------
FEEDS = {
    "buiten_temp":  "buiten-temp",       # BMP280-temperatuur als "buiten"-referentie
    "vocht":        "luchtvochtigheid",  # BME688
    "druk":         "luchtdruk",         # BME688
    "gas":          "gasweerstand",      # BME688 (kOhm)
    "wind":         "windsnelheid",
    "windrichting": "windrichting",      # graden, 0=N 90=O 180=Z 270=W
    "regen":        "neerslag",          # mm, totaal VANDAAG
    "bme_temp":     "bme-temp",          # BME688-temperatuur
    "groen":        "groen-dak",
    "gewoon":       "gewoon-dak",
    "grijs":        "grijs-dak",         # 11e feed: vraagt Adafruit IO+ (gratis = max 10 feeds)
}
# Let op: grijs dak is de 11e feed. Een gratis Adafruit IO-account laat
# maar 10 feeds toe. Lukt het aanmaken niet, zet dan hierboven de regel
# "grijs" in commentaar (#) en zet in js/config.js grijsDak op "".
# De waarde staat sowieso op de SD-kaart.

# ---------- CONFIGURATIE ----------
DAK_OPPERVLAKTE = 10
LITERS_PER_SPOELING = 6
RAIN_PER_PULSE_MM = 0.3
DEBOUNCE_MS = 200
INTERVAL_S = 60        # elke minuut versturen (11 feeds/min, limiet is 30)
SD_LOG_INTERVAL = 300   # om de 5 minuten wegschrijven naar de SD-kaart

# ---------- PIN SETUP (zoals in jullie bestaande, geteste bekabeling) ----------
bmp_cs_pin = Pin(17, Pin.OUT, value=1)
sd_cs_pin = Pin(13, Pin.OUT, value=1)
wind_pin = Pin(15, Pin.IN, Pin.PULL_UP)
rain_pin = Pin(6, Pin.IN, Pin.PULL_UP)
adc_wind = ADC(Pin(26))
led = Pin("LED", Pin.OUT)

start_tijd = time.time()
last_sd_log = 0

# ---------- INTERRUPTS: wind en regen tellen pulsen op de achtergrond ----------
rain_pulses = 0
last_rain_time = 0
wind_count = 0


def rain_pulse_handler(pin):
    global rain_pulses, last_rain_time
    now = time.ticks_ms()
    if time.ticks_diff(now, last_rain_time) > DEBOUNCE_MS:
        rain_pulses += 1
        last_rain_time = now


def wind_tick_handler(pin):
    global wind_count
    wind_count += 1


rain_pin.irq(trigger=Pin.IRQ_FALLING, handler=rain_pulse_handler)
wind_pin.irq(trigger=Pin.IRQ_FALLING, handler=wind_tick_handler)


# ---------- HELPER FUNCTIES ----------
def get_time_string():
    t = time.localtime()
    return "{:02d}:{:02d}:{:02d}".format(t[3], t[4], t[5])


def get_filename():
    t = time.localtime()
    return "/sd/weer_{:04d}{:02d}{:02d}.csv".format(t[0], t[1], t[2])


def adc_to_direction(val):
    # Zelfde tabel als in jullie bestaande code; graden komen overeen
    # met wat de website verwacht (0=Noord, 90=Oost, 180=Zuid, 270=West).
    if val <= 6220:  return "Zuiden", 180
    if val <= 11980: return "Zuidwesten", 225
    if val <= 18700: return "Westen", 270
    if val <= 29600: return "Zuidoosten", 135
    if val <= 40500: return "Noordwesten", 315
    if val <= 50300: return "Oosten", 90
    if val <= 57000: return "Noordoosten", 45
    if val <= 60500: return "Noorden", 0
    return "Onbekend", -1


def send(feed_key, value):
    if value is None:
        return False
    url = "https://io.adafruit.com/api/v2/{}/feeds/{}/data".format(secrets.AIO_USERNAME, feed_key)
    try:
        r = urequests.post(url, json={"value": value}, headers={"X-AIO-Key": secrets.AIO_KEY}, timeout=5)
        ok = r.status_code in (200, 201)
        if not ok:
            print("  x", feed_key, r.status_code)
        r.close()
        return ok
    except Exception as e:
        print("  x", feed_key, e)
        return False


# ---------- WIFI VERBINDEN ----------
print("Verbinden met wifi...")
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(secrets.WIFI_SSID, secrets.WIFI_PASS)

wacht_count = 0
while not wlan.isconnected() and wacht_count < 20:
    led.toggle()
    time.sleep(0.5)
    wacht_count += 1

if wlan.isconnected():
    led.on()
    print("Wifi OK! Pico IP:", wlan.ifconfig()[0])
    try:
        ntptime.settime()  # klok juist zetten, nodig voor "neerslag vandaag"
    except Exception:
        print("Tijd ophalen mislukt, verder zonder")
else:
    print("Geen wifi bij opstarten - controleer secrets.py")

# ---------- SENSOREN & SD-KAART INITIALISEREN ----------
bmp = bme = ds_sensor = None
sd_mounted = False
roms = []

try:
    spi0 = SPI(0, baudrate=500000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))
    bmp = bmp280_spi.BMP280(spi0, bmp_cs_pin)
    print("BMP280 OK")
except Exception as e:
    print("BMP280 fout:", e)

try:
    i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=100000)
    bme = bme680.BME680_I2C(i2c, address=0x76)
    print("BME688 OK")
except Exception as e:
    print("BME688 fout:", e)

try:
    ds_sensor = ds18x20.DS18X20(onewire.OneWire(Pin(14)))
    roms = ds_sensor.scan()
    print(f"DS18B20 OK ({len(roms)} sensoren gevonden)")
except Exception as e:
    print("DS18B20 fout:", e)

try:
    spi1 = SPI(1, baudrate=1000000, sck=Pin(10), mosi=Pin(11), miso=Pin(12))
    sd = sdcard.SDCard(spi1, sd_cs_pin)
    uos.mount(uos.VfsFat(sd), "/sd")
    sd_mounted = True
    print("SD-kaart OK")
except Exception as e:
    print("SD-kaart fout:", e)

print("Weerstation draait! Data wordt elke", INTERVAL_S, "sec naar Adafruit IO gestuurd.")

# ---------- NEERSLAG PER DAG BIJHOUDEN ----------
rain_today = 0.0
current_day = time.localtime()[2]

# ============================== MAIN LOOP ==============================
while True:
    time.sleep(max(0, INTERVAL_S - 2))
    try:
        # 1. Wind & regen (2 sec sample)
        wind_count = 0
        rain_start = rain_pulses
        time.sleep(2)
        wind_speed = round((wind_count / 2) * 2.25 * 1.609, 2)
        nieuwe_pulsen = rain_pulses - rain_start
        direction, angle = adc_to_direction(adc_wind.read_u16())

        # Neerslag "vandaag" bijhouden, resetten bij middernacht
        if time.localtime()[2] != current_day:
            current_day = time.localtime()[2]
            rain_today = 0.0
        rain_today = round(rain_today + nieuwe_pulsen * RAIN_PER_PULSE_MM, 2)

        # 2. BMP280 (gebruikt als "buiten"-temperatuur)
        t_bmp = round(bmp.temperature, 2) if bmp else None
        p_bmp = round(bmp.pressure / 100, 2) if bmp else None

        # 3. BME688 (hoofdsensor: temp, vocht, druk, gas)
        t_bme = h_bme = p_bme = None
        g_bme_kohm = None
        if bme:
            t_bme = round(bme.temperature, 2)
            h_bme = round(bme.humidity, 1)
            p_bme = round(bme.pressure, 1)
            g_bme_kohm = round(bme.gas / 1000)  # Ohm -> kOhm

        # 4. Daksensoren (3x DS18B20): laagste=grijs, midden=groen, hoogste=gewoon
        t_groen = t_gewoon = t_grijs = None
        if len(roms) >= 1:
            ds_sensor.convert_temp()
            time.sleep_ms(750)
            temps = sorted(round(ds_sensor.read_temp(r), 2) for r in roms)
            if len(temps) >= 3:
                t_grijs, t_groen, t_gewoon = temps[0], temps[1], temps[2]
            elif len(temps) == 2:
                t_grijs, t_groen = temps
            elif len(temps) == 1:
                t_groen = temps[0]

        # 5. SD-logging (elke 5 minuten, ook grijs dak, ook lokaal bewaard)
        huidige_tijd = time.time()
        if sd_mounted and (huidige_tijd - last_sd_log >= SD_LOG_INTERVAL):
            timestamp = get_time_string()
            filename = get_filename()
            try:
                try:
                    uos.stat(filename)
                except OSError:
                    with open(filename, "w") as f:
                        f.write("Tijd;BMP_T;Druk_BMP;Wind;Richting;Regen_vandaag;BME_T;Vocht;Druk_BME;Gas_kOhm;"
                                "Dak_Groen;Dak_Gewoon;Dak_Grijs\n")
                with open(filename, "a") as f:
                    f.write(f"{timestamp};{t_bmp};{p_bmp};{wind_speed};{direction};{rain_today};"
                            f"{t_bme};{h_bme};{p_bme};{g_bme_kohm};{t_groen};{t_gewoon};{t_grijs}\n")
                last_sd_log = huidige_tijd
                print("SD-log OK")
            except Exception as sd_err:
                print("SD-schrijffout:", sd_err)

        # 6. Naar Adafruit IO sturen (alle feeds van de website)
        if wlan.isconnected():
            waarden = {
                "buiten_temp":  t_bmp,
                "vocht":        h_bme,
                "druk":         p_bme,
                "gas":          g_bme_kohm,
                "wind":         wind_speed,
                "windrichting": angle,
                "regen":        rain_today,
                "bme_temp":     t_bme,
                "groen":        t_groen,
                "gewoon":       t_gewoon,
                "grijs":        t_grijs,
            }
            for naam, waarde in waarden.items():
                send(FEEDS[naam], waarde)
                time.sleep_ms(200)  # geeft de Pico wat lucht tussen verzoeken
            led.toggle(); time.sleep_ms(100); led.toggle()
            print(f"Adafruit dashboard bijgewerkt! ({get_time_string()})")
        else:
            print("Geen wifi, probeer opnieuw te verbinden...")
            wlan.connect(secrets.WIFI_SSID, secrets.WIFI_PASS)

    except Exception as e:
        print("Fout in hoofdlus:", e)
