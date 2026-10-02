export type EstimatedShowTime = {
  startLocal: string | null;
  endLocal: string | null;
  timeZone: string | null;
};

const TIME_ZONES: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function parseEstimatedShowTime(startLocal: string, endLocal: string, timeZone: string): EstimatedShowTime {
  if (!startLocal && !endLocal) return { startLocal: null, endLocal: null, timeZone: null };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startLocal)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endLocal)
    || startLocal === endLocal
    || !Object.hasOwn(TIME_ZONES, timeZone)) {
    throw new Error("Isi jam mulai, jam selesai, dan zona waktu acara dengan benar.");
  }
  return { startLocal, endLocal, timeZone };
}

export function formatEstimatedShowTime(value: EstimatedShowTime) {
  if (!value.startLocal || !value.endLocal || !value.timeZone) return null;
  const overnight = value.endLocal < value.startLocal ? " (+1 hari)" : "";
  return `${value.startLocal.slice(0, 5)}–${value.endLocal.slice(0, 5)}${overnight} ${TIME_ZONES[value.timeZone] ?? value.timeZone}`;
}
