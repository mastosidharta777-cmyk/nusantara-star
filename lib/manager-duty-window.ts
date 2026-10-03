export type ManagerDutyWindow = {
  startLocal: string;
  endLocal: string;
  location: string;
};

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

function localMinute(value: string): number | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const actual = new Date(ms);
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) return null;
  return ms / 60_000;
}

export function parseManagerDutyWindow(input: {
  startLocal: string;
  endLocal: string;
  location: string;
  eventDate: string;
  showStartLocal: string;
  showEndLocal: string;
}): ManagerDutyWindow {
  const start = localMinute(input.startLocal);
  const end = localMinute(input.endLocal);
  const showStart = localMinute(`${input.eventDate}T${input.showStartLocal}`);
  const showEndBase = localMinute(`${input.eventDate}T${input.showEndLocal}`);
  const showEnd = showStart !== null && showEndBase !== null && showEndBase < showStart
    ? showEndBase + 1440 : showEndBase;
  const location = input.location.trim();
  if (start === null || end === null || showStart === null || showEnd === null
    || start >= end || start > showStart || end < showEnd
    || location.length < 3 || location.length > 300) {
    throw new Error("Isi waktu mulai dan selesai bertugas yang mencakup seluruh penampilan, serta lokasi acara yang jelas.");
  }
  return { startLocal: input.startLocal, endLocal: input.endLocal, location };
}

export function formatDutyLocal(instant: string | null | undefined, timeZone: string | null | undefined): string {
  if (!instant || !timeZone) return "";
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
