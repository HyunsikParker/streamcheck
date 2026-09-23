// Field evidence: where the citizen was, and when and where each photo was
// taken. Everything is read on the device; no photo leaves the browser.

// Great-circle distance in metres.
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '?';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// Minimal EXIF reader for JPEG: DateTimeOriginal (or DateTime) and GPS position.
// Returns {} when the file has no EXIF, which is common for screenshots and
// for photos whose location was stripped by the phone.
export function readExif(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || size < 2) break;
    off += 2 + size;
  }
  return {};
}

function parseTiff(v, start) {
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, little);
  const u32 = (o) => v.getUint32(start + o, little);
  const ascii = (o, n) => {
    let s = '';
    for (let i = 0; i < n; i++) { const c = v.getUint8(start + o + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const rational = (o) => u32(o) / (u32(o + 4) || 1);
  const ifd = (o) => {
    const out = {};
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const valOff = count * ({ 2: 1, 3: 2, 4: 4, 5: 8 }[type] || 1) > 4 ? u32(e + 8) : e + 8;
      if (type === 2) out[tag] = ascii(valOff, count);
      else if (type === 3) out[tag] = u16(valOff);
      else if (type === 4) out[tag] = u32(valOff);
      else if (type === 5) out[tag] = Array.from({ length: count }, (_, k) => rational(valOff + k * 8));
    }
    return out;
  };
  const ifd0 = ifd(u32(4));
  const exif = ifd0[0x8769] ? ifd(ifd0[0x8769]) : {};
  const gps = ifd0[0x8825] ? ifd(ifd0[0x8825]) : {};
  const result = {};
  const stamp = exif[0x9003] || ifd0[0x0132];
  if (stamp && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(stamp)) {
    // EXIF local time without zone; kept as written.
    result.takenLocal = `${stamp.slice(0, 4)}-${stamp.slice(5, 7)}-${stamp.slice(8, 10)}T${stamp.slice(11, 19)}`;
  }
  const dms = (a) => (Array.isArray(a) && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null);
  const lat = dms(gps[2]);
  const lon = dms(gps[4]);
  if (lat !== null && lon !== null) {
    result.lat = gps[1] === 'S' ? -lat : lat;
    result.lon = gps[3] === 'W' ? -lon : lon;
  }
  return result;
}

// Age of a photo relative to the assessment, in hours, treating the EXIF
// wall-clock time as the device's local time.
export function photoAgeHours(takenLocal, assessedAt = new Date()) {
  if (!takenLocal) return null;
  const taken = new Date(takenLocal); // parsed as local time
  if (Number.isNaN(taken.getTime())) return null;
  return (assessedAt.getTime() - taken.getTime()) / 3600e3;
}
