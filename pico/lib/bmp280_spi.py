from time import sleep_ms

# BMP280 registers
_REG_CHIPID     = 0xD0
_REG_RESET      = 0xE0
_REG_CTRL_MEAS  = 0xF4
_REG_CONFIG     = 0xF5
_REG_PRESS_MSB  = 0xF7
_CHIP_ID        = 0x58

class BMP280:
    def __init__(self, spi, cs):
        self._spi = spi
        self._cs = cs
        self._cs.init(self._cs.OUT, value=1)

        # Check chip ID
        chip_id = self._read_reg(_REG_CHIPID, 1)[0]
        if chip_id != _CHIP_ID:
            raise RuntimeError("BMP280 not found, got ID 0x{:02X}".format(chip_id))

        # Reset sensor
        self._write_reg(_REG_RESET, b'\xB6')
        sleep_ms(100)

        # Load calibration data
        self._load_calibration()

        # Configure: oversampling x1, normal mode
        self._write_reg(_REG_CTRL_MEAS, b'\x27')  # temp x1, press x1, normal
        self._write_reg(_REG_CONFIG, b'\xA0')     # standby 1000ms

    # --- SPI helpers ---
    def _read_reg(self, reg, length):
        buf = bytearray(length)
        self._cs(0)
        self._spi.write(bytearray([reg | 0x80]))
        self._spi.readinto(buf)
        self._cs(1)
        return buf

    def _write_reg(self, reg, data):
        self._cs(0)
        self._spi.write(bytearray([reg & 0x7F]) + data)
        self._cs(1)

    # --- Helpers for calibration ---
    def _u16(self, b):
        return int.from_bytes(b, "little")

    def _s16(self, b):
        val = int.from_bytes(b, "little")
        if val & 0x8000:
            return -((~val + 1) & 0xFFFF)
        return val

    # --- Calibration data ---
    def _load_calibration(self):
        calib = self._read_reg(0x88, 24)
        self.dig_T1 = self._u16(calib[0:2])
        self.dig_T2 = self._s16(calib[2:4])
        self.dig_T3 = self._s16(calib[4:6])
        self.dig_P1 = self._u16(calib[6:8])
        self.dig_P2 = self._s16(calib[8:10])
        self.dig_P3 = self._s16(calib[10:12])
        self.dig_P4 = self._s16(calib[12:14])
        self.dig_P5 = self._s16(calib[14:16])
        self.dig_P6 = self._s16(calib[16:18])
        self.dig_P7 = self._s16(calib[18:20])
        self.dig_P8 = self._s16(calib[20:22])
        self.dig_P9 = self._s16(calib[22:24])

    # --- Properties ---
    @property
    def temperature(self):
        raw = self._read_reg(_REG_PRESS_MSB + 3, 3)
        adc_T = ((raw[0] << 16) | (raw[1] << 8) | raw[2]) >> 4
        return self._compensate_T(adc_T) / 100

    @property
    def pressure(self):
        raw = self._read_reg(_REG_PRESS_MSB, 6)
        adc_P = ((raw[0] << 16) | (raw[1] << 8) | raw[2]) >> 4
        adc_T = ((raw[3] << 16) | (raw[4] << 8) | raw[5]) >> 4
        t_fine = self._compensate_T(adc_T, update=True)
        return self._compensate_P(adc_P, t_fine)

    # --- Compensation formulas ---
    def _compensate_T(self, adc_T, update=False):
        var1 = ((((adc_T >> 3) - (self.dig_T1 << 1))) * self.dig_T2) >> 11
        var2 = (((((adc_T >> 4) - self.dig_T1) * ((adc_T >> 4) - self.dig_T1)) >> 12) * self.dig_T3) >> 14
        t_fine = var1 + var2
        if update:
            self.t_fine = t_fine
        return (t_fine * 5 + 128) >> 8

    def _compensate_P(self, adc_P, t_fine):
        var1 = t_fine - 128000
        var2 = var1 * var1 * self.dig_P6
        var2 = var2 + ((var1 * self.dig_P5) << 17)
        var2 = var2 + (self.dig_P4 << 35)
        var1 = ((var1 * var1 * self.dig_P3) >> 8) + ((var1 * self.dig_P2) << 12)
        var1 = (((1 << 47) + var1) * self.dig_P1) >> 33
        if var1 == 0:
            return 0
        p = 1048576 - adc_P
        p = (((p << 31) - var2) * 3125) // var1
        var1 = (self.dig_P9 * (p >> 13) * (p >> 13)) >> 25
        var2 = (self.dig_P8 * p) >> 19
        p = ((p + var1 + var2) >> 8) + (self.dig_P7 << 4)
        return p / 256

