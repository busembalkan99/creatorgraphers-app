// Test JPEG'i üretir; isteğe bağlı EXIF (tarih, makine, GPS) ekler.
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';

function tiff({ tarih, gps }) {
  // Büyük-endian TIFF. IFD0: Make, Model, ExifIFD ptr, (GPS ptr). ExifIFD: DateTimeOriginal, FNumber, ExposureTime, ISO.
  const ascii = s => Buffer.from(s + '\0', 'ascii');
  const ent = [];
  const data = [];
  let off = 0;
  const bufs = [];
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  // düzen: header(8) | IFD0 | ExifIFD | GPSIFD | veri
  const make = ascii('NIKON CORPORATION'), model = ascii('NIKON Z 6_2');
  const ifd0Count = 3 + (gps ? 1 : 0);
  const exifCount = tarih ? 4 : 3;
  const gpsCount = gps ? 4 : 0;
  const ifdSize = n => 2 + n * 12 + 4;
  const ifd0Off = 8, exifOff = ifd0Off + ifdSize(ifd0Count), gpsOff = exifOff + ifdSize(exifCount);
  let dataOff = gpsOff + (gps ? ifdSize(gpsCount) : 0);
  const veri = [];
  const koy = b => { const o = dataOff; veri.push(b); dataOff += b.length; return o; };
  const e = (tag, type, count, valOrOff) => Buffer.concat([u16(tag), u16(type), u32(count), u32(valOrOff)]);
  const rat = (a, b) => Buffer.concat([u32(a), u32(b)]);
  const ifd0 = [e(0x010f, 2, make.length, koy(make)), e(0x0110, 2, model.length, koy(model)), e(0x8769, 4, 1, exifOff)];
  if (gps) ifd0.push(e(0x8825, 4, 1, gpsOff));
  const exif = [];
  if (tarih) { const t = ascii(tarih); exif.push(e(0x9003, 2, t.length, koy(t))); }
  exif.push(e(0x829a, 5, 1, koy(rat(1, 250))));
  exif.push(e(0x829d, 5, 1, koy(rat(28, 10))));
  exif.push(Buffer.concat([u16(0x8827), u16(3), u32(1), u16(400), u16(0)]));
  exif.sort((a, b) => a.readUInt16BE(0) - b.readUInt16BE(0));
  const gpsE = gps ? [
    Buffer.concat([u16(1), u16(2), u32(2), Buffer.from('N\0\0\0')]),
    e(2, 5, 3, koy(Buffer.concat([rat(41, 1), rat(2, 1), rat(0, 1)]))),
    Buffer.concat([u16(3), u16(2), u32(2), Buffer.from('E\0\0\0')]),
    e(4, 5, 3, koy(Buffer.concat([rat(28, 1), rat(58, 1), rat(0, 1)]))),
  ] : [];
  const ifd = (list) => Buffer.concat([u16(list.length), ...list, u32(0)]);
  return Buffer.concat([Buffer.from('MM'), u16(42), u32(8), ifd(ifd0), ifd(exif), gps ? ifd(gpsE) : Buffer.alloc(0), ...veri]);
}

function exifEkle(jpeg, opt) {
  const t = tiff(opt);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), t]);
  const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, body, jpeg.subarray(2)]);
}

const bugun = process.argv[2]; // YYYY:MM:DD
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const renk = { dogru: '#556', yanlis: '#655', ayarsiz: '#565', tarihsiz: '#444', gps: '#466', dikey: '#664' };
for (const [ad, r] of Object.entries(renk)) {
  const dikey = ad === 'dikey';
  await p.setViewportSize(dikey ? { width: 800, height: 1200 } : { width: 1200, height: 800 });
  await p.setContent(`<body style="margin:0;background:linear-gradient(135deg,${r},#111);display:flex;align-items:center;justify-content:center;height:100vh;font:900 120px sans-serif;color:#ddd">${ad}</body>`);
  const jpg = await p.screenshot({ type: 'jpeg', quality: 90 });
  const opt = {
    dogru: { tarih: `${bugun} 18:22:05` },
    yanlis: { tarih: '2026:08:03 11:00:00' },
    ayarsiz: { tarih: '2019:03:14 18:00:00' },
    tarihsiz: null,
    gps: { tarih: `${bugun} 19:40:00`, gps: true },
    dikey: { tarih: `${bugun} 20:00:00` },
  }[ad];
  fs.writeFileSync(`/tmp/cgapp/${ad}.jpg`, opt ? exifEkle(jpg, opt) : jpg);
}
await b.close();
