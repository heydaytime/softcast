// Client-only convenience: remember recently used temperatures and colors so the
// operator can re-apply them quickly. This is NOT authoritative state — it lives in
// localStorage and never affects what the backend/Redis stores.

export type ColorRecent = { hue: number; saturation: number };

const CAP = 6;
const cctKey = "softcast:recents:cct";
const colorKey = "softcast:recents:color";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage may be unavailable (private mode); recents are best-effort.
  }
}

export function getCctRecents(): number[] {
  return read<number>(cctKey);
}

export function pushCctRecent(temperature: number): number[] {
  const value = Math.round(temperature);
  const next = [value, ...read<number>(cctKey).filter((item) => item !== value)].slice(0, CAP);
  write(cctKey, next);
  return next;
}

export function getColorRecents(): ColorRecent[] {
  return read<ColorRecent>(colorKey);
}

export function pushColorRecent(hue: number, saturation: number): ColorRecent[] {
  const value = { hue: Math.round(hue), saturation: Math.round(saturation * 100) / 100 };
  const same = (item: ColorRecent) => item.hue === value.hue && item.saturation === value.saturation;
  const next = [value, ...read<ColorRecent>(colorKey).filter((item) => !same(item))].slice(0, CAP);
  write(colorKey, next);
  return next;
}
