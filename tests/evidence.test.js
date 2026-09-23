import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, formatDistance, readExif, photoAgeHours } from '../src/evidence.js';
import { runChecks, evidenceChecks } from '../src/checks.js';
import { toFhirBundle } from '../src/fhir.js';

// Builds a minimal little-endian JPEG with EXIF DateTimeOriginal and GPS.
function jpegWithExif({ stamp, lat, lon }) {
  const toDms = (x) => {
    const a = Math.abs(x);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60 * 100);
    return [[d, 1], [m, 1], [s, 100]];
  };
  const tiff = new DataView(new ArrayBuffer(512));
  let o = 0;
  const u16 = (v) => { tiff.setUint16(o, v, true); o += 2; };
  const u32 = (v) => { tiff.setUint32(o, v, true); o += 4; };
  // header
  tiff.setUint8(0, 0x49); tiff.setUint8(1, 0x49); o = 2; u16(42); u32(8);
  // IFD0 at 8: two entries (ExifIFD, GPS)
  const ifd0 = 8, exifIfd = 40, gpsIfd = 80, strOff = 160, ratOff = 200;
  o = ifd0; u16(2);
  u16(0x8769); u16(4); u32(1); u32(exifIfd);
  u16(0x8825); u16(4); u32(1); u32(gpsIfd);
  u32(0);
  // Exif IFD: DateTimeOriginal
  o = exifIfd; u16(1); u16(0x9003); u16(2); u32(20); u32(strOff); u32(0);
  for (let i = 0; i < 19; i++) tiff.setUint8(strOff + i, stamp.charCodeAt(i));
  // GPS IFD: LatRef, Lat, LonRef, Lon
  o = gpsIfd; u16(4);
  u16(1); u16(2); u32(2); tiff.setUint8(o, lat < 0 ? 83 : 78); o += 4;
  u16(2); u16(5); u32(3); u32(ratOff);
  u16(3); u16(2); u32(2); tiff.setUint8(o, lon < 0 ? 87 : 69); o += 4;
  u16(4); u16(5); u32(3); u32(ratOff + 24);
  u32(0);
  o = ratOff;
  for (const [n, dd] of [...toDms(lat), ...toDms(lon)]) { u32(n); u32(dd); }
  const tiffBytes = new Uint8Array(tiff.buffer, 0, 260);
  const app1Len = 2 + 6 + tiffBytes.length;
  const out = new Uint8Array(2 + 2 + app1Len + 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, app1Len >> 8, app1Len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  out.set(tiffBytes, 12);
  out.set([0xff, 0xd9], 12 + tiffBytes.length);
  return out.buffer;
}

const site = { code: 'C1', name: 'Exploratório', city: 'Coimbra', lat: 40.19787, lon: -8.42865 };

test('distance: 1 degree of latitude is about 111 km', () => {
  assert.ok(Math.abs(distanceM(0, 0, 1, 0) - 111195) < 50);
  assert.equal(formatDistance(420), '420 m');
  assert.equal(formatDistance(3240), '3.2 km');
});

test('EXIF: capture time and signed GPS position are read', () => {
  const e = readExif(jpegWithExif({ stamp: '2026:09:22 10:15:30', lat: 40.19787, lon: -8.42865 }));
  assert.equal(e.takenLocal, '2026-09-22T10:15:30');
  assert.ok(Math.abs(e.lat - 40.19787) < 1e-4);
  assert.ok(Math.abs(e.lon + 8.42865) < 1e-4);
  assert.deepEqual(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), {});
});

test('photo age in hours from the device-local capture time', () => {
  assert.equal(Math.round(photoAgeHours('2026-09-20T10:00:00', new Date('2026-09-23T10:00:00'))), 72);
  assert.equal(photoAgeHours(undefined), null);
});

test('evidence checks: phone far from site, photo from elsewhere, old photo', () => {
  const evidence = {
    here: { lat: 40.2248, lon: -8.4300, accuracy: 20 },
    photos: {
      up: { lat: 40.19790, lon: -8.42860, takenLocal: '2026-09-23T09:00:00' },
      down: { lat: 38.72, lon: -9.14, takenLocal: '2026-09-23T09:05:00' },
      around: { takenLocal: '2026-09-15T09:00:00' },
    },
  };
  const ids = evidenceChecks(evidence, site, new Date('2026-09-23T10:00:00')).map((f) => f.id).sort();
  assert.deepEqual(ids, ['far-from-site', 'photo-far-down', 'photo-old-around']);
  const near = evidenceChecks({ here: { lat: 40.1980, lon: -8.4287, accuracy: 15 } }, site);
  assert.equal(near.length, 0);
});

test('a poor GPS fix widens the allowed distance', () => {
  const flags = evidenceChecks({ here: { lat: 40.2030, lon: -8.4287, accuracy: 900 } }, site);
  assert.equal(flags.length, 0);
});

test('runChecks includes evidence only when evidence and site are given', () => {
  const obs = { overall: 'MODERATE' };
  const evidence = { here: { lat: 41, lon: -8, accuracy: 10 } };
  assert.equal(runChecks(obs, null).length, 0);
  assert.equal(runChecks(obs, null, evidence, site)[0].id, 'far-from-site');
});

test('FHIR: photos become Media with hash and notes, distance becomes an Observation', () => {
  const evidence = {
    here: { lat: 40.1980, lon: -8.4287, accuracy: 15, at: '2026-09-23T09:00:00Z' },
    photos: { up: { type: 'image/jpeg', size: 123456, sha1: 'q5ZQ9d9nC1d4t6oD1wL9R0mWc2Q=', sha256: 'ab'.repeat(32), lat: 40.19790, lon: -8.42860, takenLocal: '2026-09-23T09:00:00' } },
  };
  const b = toFhirBundle({ obs: { overall: 'GOOD' }, evidence, site, createdAt: '2026-09-23T09:10:00Z' });
  const media = b.entry.map((e) => e.resource).filter((r) => r.resourceType === 'Media');
  assert.equal(media.length, 1);
  assert.equal(media[0].content.hash, 'q5ZQ9d9nC1d4t6oD1wL9R0mWc2Q=');
  assert.match(media[0].note.map((n) => n.text).join(' '), /m from the site/);
  const dist = b.entry.map((e) => e.resource).find((r) => r.code?.coding?.[0].code === 'observerDistance');
  assert.ok(dist.valueQuantity.value < 100);
  assert.ok(!JSON.stringify(dist).includes('40.198'), 'raw device coordinates are not exported');
});
