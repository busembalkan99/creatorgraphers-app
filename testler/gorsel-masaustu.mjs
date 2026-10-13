// Masaüstü ekran görüntüleri: node testler/gorsel-masaustu.mjs   (CG_APP ile adres değişir)
// Kendi verisini kurar ve siler. Tam sayfa: kaydırılan kap .sc olduğundan görüntü için pencere yüksekliği
// içeriğe göre geçici büyütülüp geri alınıyor (Wrapped hariç: pencere görüntüsü).
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, depo } from './ortak.mjs';

const APP = process.env.CG_APP ?? 'http://localhost:5180/';
const BOYUTLAR = [[1024, 768], [1440, 900], [1920, 1080]];
fs.mkdirSync('/tmp/cgapp/ss', { recursive: true });

async function sayfa(b, [w, h], eposta = 'kurucu@test.local') {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error }, eposta);
  return p;
}
async function ac(p, yol) { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1800) }

const kurulan = [];
const saat = n => new Date(Date.now() + n * 3600000).toISOString();
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kimlik = async e => (await admin.from('uyeler').select('id').eq('eposta', e).single()).data.id;
async function acikEtkinlik(asama, temaAdlari = ['Yansıma', 'Kalabalık', 'Gölge']) {
  const z = asama === 'yukleme'
    ? { yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44) }
    : { yukleme_baslar: saat(-50), yukleme_biter: saat(-2), oylama_biter: saat(20) };
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun(), kuran: await kimlik('kurucu@test.local'), ...z }).select('id').single()).data;
  kurulan.push(e.id);
  const temalar = (await admin.from('temalar').insert(temaAdlari.map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: i < 2 })))
    .select('id, ad, sira, bulusmada').order('sira')).data;
  return { id: e.id, temalar };
}
const OLCU = { dogru: [1200, 800], dikey: [800, 1200] };
async function kareKoy(etkinlik, tema, eposta, dosya = 'dogru') {
  const sahip = await kimlik(eposta);
  const yol = `${etkinlik}/${tema}/${crypto.randomUUID()}.jpg`;
  await depo.koy(yol, fs.readFileSync(`/tmp/cgapp/${dosya}.jpg`), sahip);
  const [genislik, yukseklik] = OLCU[dosya] ?? OLCU.dogru;
  return (await admin.from('kareler').insert({ tema, sahip, dosya: yol, genislik, yukseklik, cekim_gunu: bugun() }).select('id').single()).data.id;
}
// Sonuçlanmış etkinlik: üç tema, her temada bir birinci; kurucunun da karesi var ("Katıldığın son etkinlik")
// zengin: ilk temada 8 kare (6 üyenin sekizi için eşit olmayan puan); kürsüde en az bir kare çıksın
async function bitmisEtkinlik(zengin = false, kurucuEkstra = false) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun(), kuran: await kimlik('kurucu@test.local'), yukleme_baslar: saat(-100), yukleme_biter: saat(-60), oylama_biter: saat(-1) }).select('id').single()).data;
  kurulan.push(e.id);
  const temalar = (await admin.from('temalar').insert(['Yansıma', 'Kalabalık', 'Gölge'].map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: true }))).select('id, ad, sira').order('sira')).data;
  const uyeler = await Promise.all(['kurucu', 'baris', 'can', 'deniz', 'ece', 'zeynep'].map(async a => [a, await kimlik(`${a}@test.local`)]));
  const kareler = [];
  const dagilim = [['baris', 0], ['can', 1], ['deniz', 2], ['kurucu', 0]];
  if (kurucuEkstra) dagilim.push(['kurucu', 1], ['kurucu', 2]);
  if (zengin) dagilim.push(['ece', 0], ['zeynep', 0], ['can', 0], ['deniz', 0]);
  for (const [i, a] of dagilim.map(([a, i]) => [i, a])) {
    const id = await kareKoy(e.id, temalar[i].id, `${a}@test.local`);
    kareler.push({ id, sahip: uyeler.find(u => u[0] === a)[1], puan: Math.max(1, 9 - kareler.length) });
  }
  for (const k of kareler) for (const [, veren] of uyeler) if (veren !== k.sahip) await admin.from('oylar').insert({ kare: k.id, veren, puan: k.puan });
  return { id: e.id, temalar };
}
async function temizle() {
  for (const id of kurulan) {
    const t = ((await admin.from('temalar').select('id').eq('etkinlik', id)).data ?? []).map(x => x.id);
    const k = (await admin.from('kareler').select('dosya').in('tema', t)).data ?? [];
    if (k.length) await depo.sil(k.map(x => x.dosya));
    await admin.from('kareler').delete().in('tema', t);
    await admin.from('temalar').delete().eq('etkinlik', id);
    await admin.from('etkinlikler').delete().eq('id', id);
  }
}


async function cek(p, [w, h], ad, tam = true) {
  const dosya = `/tmp/cgapp/ss/masaustu-${w}-${ad}.png`;
  if (!tam) { await p.screenshot({ path: dosya }); return dosya }
  let y = h;
  for (let n = 0; n < 3; n++) {
    const ek = await p.evaluate(() => { const sc = document.querySelector('.sc'); return sc ? sc.scrollHeight - sc.clientHeight : 0 });
    if (ek <= 0) break;
    y = Math.min(y + ek, 6000);
    await p.setViewportSize({ width: w, height: y }); await p.waitForTimeout(500);
  }
  await p.screenshot({ path: dosya });
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300);
  return dosya;
}

const yazilan = [];
const b = await chromium.launch();
try {
  const Y = await acikEtkinlik('yukleme');
  const S = await bitmisEtkinlik(true, true);
  for (const a of ['baris', 'can']) await kareKoy(Y.id, Y.temalar[0].id, `${a}@test.local`);
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut);
    await p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), S.id);
    for (const [yol, ad] of [['etkinlikler', 'etkinlikler'], ['siralama', 'siralama'], ['profil', 'profil'], [`sonuc/${S.id}`, 'sonuc'], ['yukle', 'yukle'], ['asama', 'asama']]) {
      await ac(p, yol); yazilan.push(await cek(p, boyut, ad));
    }
    await ac(p, `wrapped/${S.id}`); yazilan.push(await cek(p, boyut, 'wrapped', false));
    await p.context().close();
  }
  await temizle(); kurulan.length = 0;
  const O = await acikEtkinlik('oylama');
  for (const a of ['baris', 'can', 'deniz']) await kareKoy(O.id, O.temalar[0].id, `${a}@test.local`);
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut);
    await ac(p, `oyla/${O.temalar[0].id}`); await p.waitForTimeout(800);
    yazilan.push(await cek(p, boyut, 'oyla'));
    await p.context().close();
  }
} finally { await b.close(); await temizle() }
console.log(yazilan.join('\n'));
