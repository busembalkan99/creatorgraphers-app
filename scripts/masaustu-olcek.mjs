// Masaüstü yazı ölçeği (karar 129). index.css'teki sabit punto kurallarını iki tabloya göre büyütüp
// src/masaustu-olcek.css'i üretir. Üretilen dosyayı elle düzenleme; index.css'e yeni punto gelince
// tabloya ekle ve yeniden çalıştır. Kullanım: node scripts/masaustu-olcek.mjs [--denetle]
import fs from 'node:fs';
const KOK = new URL('..', import.meta.url).pathname;
// telefon px → masaüstü px. ORTA: 768-1199, TAM: 1200+ (spec ölçek tablosu)
const ORTA = { 8: 9, 10: 11, 10.5: 11.5, 11: 12, 12: 13, 12.5: 14, 13: 15, 15: 17, 16: 16, 17: 20, 20: 23, 22: 26, 26: 36, 29: 44, 30: 56, 34: 56, 44: 56, 46: 56, 52: 72, 58: 68, 64: 80 };
const TAM = { 8: 10, 10: 12, 10.5: 12.5, 11: 13, 12: 14, 12.5: 15, 13: 16, 15: 18, 16: 17, 17: 22, 20: 26, 22: 30, 26: 44, 29: 56, 30: 72, 34: 72, 44: 64, 46: 64, 52: 88, 58: 80, 64: 96 };
const ON = '.app:has(> .m-ray)';

// Yalnız en üst düzey kurallar; @media ve benzeri bloklar atlanıyor
function ustDuzey(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  while (i < css.length) {
    const ac = css.indexOf('{', i); if (ac < 0) break;
    const sec = css.slice(i, ac).trim();
    let d = 1, j = ac + 1;
    while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++ }
    if (!sec.startsWith('@')) out.push([sec, css.slice(ac + 1, j - 1)]);
    i = j;
  }
  return out;
}
function uret() {
  const kurallar = ustDuzey(fs.readFileSync(KOK + 'src/index.css', 'utf8'));
  const blok = tablo => kurallar.flatMap(([sec, govde]) => {
    const m = govde.match(/(?:^|;)\s*font-size:\s*([0-9.]+)px/);
    if (!m) return [];
    const yeni = tablo[m[1]];
    if (yeni == null) throw new Error(`tabloda yok: ${m[1]}px (${sec})`);
    return [`${sec.split(',').map(s => `${ON} ${s.trim()}`).join(',')}{font-size:${yeni}px}`];
  });
  return `/* ÜRETİLDİ: node scripts/masaustu-olcek.mjs (karar 129). Elle düzenleme. */\n`
    + `@media (min-width:768px) and (min-height:520px){\n${blok(ORTA).join('\n')}\n}\n@media (min-width:1200px) and (min-height:520px){\n${blok(TAM).join('\n')}\n}\n`;
}
const yol = KOK + 'src/masaustu-olcek.css', yeni = uret();
if (process.argv.includes('--denetle')) {
  const eski = fs.existsSync(yol) ? fs.readFileSync(yol, 'utf8') : '';
  if (eski !== yeni) { console.error('masaustu-olcek.css eski: node scripts/masaustu-olcek.mjs'); process.exit(1) }
  console.log('güncel');
} else { fs.writeFileSync(yol, yeni); console.log('yazıldı') }
