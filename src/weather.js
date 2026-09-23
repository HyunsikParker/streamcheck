// Recent weather at the site from Open-Meteo (free, no key).
// Docs: https://open-meteo.com/en/docs

export function weatherUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'precipitation,temperature_2m',
    past_days: '3',
    forecast_days: '1',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

// Summarise the hourly series relative to `now` (epoch ms).
export function summarise(json, now = Date.now()) {
  const h = json.hourly || {};
  const offsetMs = (json.utc_offset_seconds || 0) * 1000;
  const times = (h.time || []).map((t) => Date.parse(`${t}:00Z`) - offsetMs);
  const rain = h.precipitation || [];
  const temp = h.temperature_2m || [];
  let rain48h = 0;
  const temps72 = [];
  for (let i = 0; i < times.length; i++) {
    const age = now - times[i];
    if (age < 0) continue;
    if (age <= 48 * 3600e3 && Number.isFinite(rain[i])) rain48h += rain[i];
    if (age <= 72 * 3600e3 && Number.isFinite(temp[i])) temps72.push(temp[i]);
  }
  const localDay = new Date(now + offsetMs).toISOString().slice(0, 10);
  const today = (h.time || []).map((t, i) => [t, temp[i]]).filter(([t, v]) => t.startsWith(localDay) && Number.isFinite(v)).map(([, v]) => v);
  const round = (x) => Math.round(x * 10) / 10;
  return {
    rain48h: round(rain48h),
    airMean3d: temps72.length ? round(temps72.reduce((a, b) => a + b, 0) / temps72.length) : null,
    airMaxToday: today.length ? round(Math.max(...today)) : null,
    source: 'api.open-meteo.com',
    fetchedAt: new Date(now).toISOString(),
  };
}

export async function fetchWeather(lat, lon, fetchFn = fetch, now = Date.now()) {
  try {
    const res = await fetchFn(weatherUrl(lat, lon));
    if (!res.ok) return null;
    return summarise(await res.json(), now);
  } catch {
    return null;
  }
}
