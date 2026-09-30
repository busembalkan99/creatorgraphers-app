// Bildirim ekranları (karar 120): cihaz durumları taklitle (window.__pushTaklit), sunucu gerçek.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const b = await webkit.launch(); const hatalar = [];
async function sayfa(taklit, eposta = 'kurucu@test.local') {
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  await ctx.addInitScript(t => {
    const durum = { izin: t.izin, ab: t.abone ? { endpoint: 'https://push.example/cihaz1', p256dh: 'p', auth: 'a' } : null };
    window.__pushTaklit = { ios: t.ios, anaEkran: t.anaEkran, iosSurum: t.iosSurum, destek: t.destek,
      get izin() { return durum.izin; },
      izinIste: async () => { durum.izin = t.cevap; return t.cevap; },
      abonelik: async () => durum.ab,
      aboneOl: async () => (durum.ab = { endpoint: 'https://push.example/cihaz1', p256dh: 'p', auth: 'a' }),
      birak: async () => { durum.ab = null; } };
  }, taklit);
  const p = await ctx.newPage(); p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(2500);
  return p;
}
const yazi = async (p, s) => ((await p.locator(s).first().textContent({ timeout: 1500 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const TAM = { ios: false, anaEkran: false, iosSurum: null, destek: true, izin: 'default', cevap: 'granted', abone: false };
try {
  // acilabilir → aç → acik
  let p = await sayfa(TAM);
  bekle('açılabilir: davet kartı', /Bildirimleri aç/.test(await yazi(p, '.bildirim-karti')));
  await kartDenetle(p, 'bildirim kartı', bekle);
  await p.getByRole('button', { name: 'Bildirimleri aç' }).click(); await p.waitForTimeout(1200);
  bekle('açınca sunucuda abonelik', ((await admin.from('bildirim_abonelikleri').select('kullanici').eq('endpoint', 'https://push.example/cihaz1')).data ?? [])[0]?.kullanici === A.id);
  bekle('açınca kart gidiyor', (await p.locator('.bildirim-karti').count()) === 0);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1200);
  bekle('Ayarlar anahtarı açık', (await p.getByRole('button', { name: /Bildirimler/ }).getAttribute('aria-pressed')) === 'true');
  await p.getByRole('button', { name: /Bildirimler/ }).click(); await p.waitForTimeout(1000);
  bekle('anahtarı kapatınca abonelik silindi', ((await admin.from('bildirim_abonelikleri').select('id')).data ?? []).length === 0);
  await p.getByRole('button', { name: /Bildirimler/ }).click(); await p.waitForTimeout(1000);
  // çıkışta abonelik siliniyor
  await p.getByRole('button', { name: 'Çıkış yap' }).click(); await p.waitForTimeout(1500);
  bekle('çıkış yapınca bu cihazın aboneliği silindi', ((await admin.from('bildirim_abonelikleri').select('id')).data ?? []).length === 0);
  // Şimdi değil: kart bu cihazda bir daha çıkmıyor
  p = await sayfa(TAM);
  await p.getByRole('button', { name: 'Şimdi değil' }).click(); await p.reload(); await p.waitForTimeout(2000);
  bekle('"Şimdi değil" kartı kalıcı gizliyor', (await p.locator('.bildirim-karti').count()) === 0);
  // iPhone Safari sekmesi
  p = await sayfa({ ...TAM, ios: true, anaEkran: false, iosSurum: [17, 5] });
  bekle('iPhone Safari: ana ekrana ekle yönlendirmesi', /Ana Ekrana Ekle/.test(await yazi(p, '.bildirim-karti')), await yazi(p, '.bildirim-karti'));
  // iOS 16.3 ana ekranda: desteklenmiyor
  p = await sayfa({ ...TAM, ios: true, anaEkran: true, iosSurum: [16, 3], destek: false });
  bekle('iOS 16.3: kart yok', (await p.locator('.bildirim-karti').count()) === 0);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1200);
  bekle('iOS 16.3: Ayarlar "desteklenmiyor"', /Bu telefonda bildirim desteklenmiyor/.test(await yazi(p, '.sc')));
  // izin reddedilmiş
  p = await sayfa({ ...TAM, izin: 'denied' });
  bekle('izin yok: kart yok', (await p.locator('.bildirim-karti').count()) === 0);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1200);
  bekle('izin yok: Ayarlar yönlendirmesi', /Bildirimlere telefonun ayarlarından izin ver/.test(await yazi(p, '.sc')));
  // Aşama sayısı (açık etkinlik gerekiyor)
  const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
  await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }), yukleme_baslar: saat(-1), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id });
  p = await sayfa({ ...TAM, abone: true, izin: 'granted' });
  await A.c.rpc('bildirim_abone_ol', { p_endpoint: 'https://push.example/cihaz1', p_p256dh: 'p', p_auth: 'a' });
  await p.goto(APP + '#/asama'); await p.reload(); await p.waitForTimeout(2000);
  bekle('Aşama: "Bildirim açık: 1 / 1 üye"', /Bildirim açık: 1 \/ 1 üye/.test(await yazi(p, '.sc')), await yazi(p, '.sc'));
  // Bekleme ekranı: onay bekleyen de bildirimi açabiliyor
  const D = await kullanici('deniz@test.local', 'Deniz Yılmaz');
  await D.c.from('istekler').insert({ kullanici: D.id, eposta: 'deniz@test.local', ad: 'Deniz Yılmaz' });
  const pd = await sayfa(TAM, 'deniz@test.local');
  bekle('bekleme ekranı: "Onaylanınca haber verelim mi?"', /Onaylanınca haber verelim mi/.test(await yazi(pd, '.bildirim-karti')));
  bekle('bekleme ekranı metni bildirime göre', /Onaylanınca bildirim gelir/.test(await yazi(pd, '.kutu')) || /Bildirim gitmiyor/.test(await yazi(pd, '.kutu')));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
