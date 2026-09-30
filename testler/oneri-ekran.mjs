// Tema önerisi ekranları (kararlar 82, 121): kart, form, Önerilerin, havuz, Kurulum'da havuzdan seçim.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
const b = await webkit.launch(); const hatalar = [];
async function sayfa(e) {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage(); p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, e);
  await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(2500); return p;
}
const yazi = async (p, s) => ((await p.locator(s).first().textContent({ timeout: 1500 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
try {
  const p = await sayfa('baris@test.local');
  bekle('açık etkinlik yokken "Tema öner" kartı', /Tema öner/.test(await yazi(p, '.oneri-karti')));
  await p.getByRole('button', { name: 'Tema öner' }).click(); await p.waitForTimeout(800);
  bekle('form açıldı', (await p.evaluate(() => location.hash)) === '#/oner');
  await p.locator('#oneri-ad').fill('Gece'); await p.locator('#oneri-gerekce').fill('Işıkların altında');
  await p.getByRole('button', { name: 'Öneriyi bırak' }).click(); await p.waitForTimeout(1500);
  bekle('bırakınca Profil\'deki listene döndü', (await p.evaluate(() => location.hash)).startsWith('#/profil') && /Gece/.test(await yazi(p, '.onerilerim')) && /Havuzda/.test(await yazi(p, '.onerilerim')));
  await kartDenetle(p, 'profil önerilerim', bekle);
  await p.goto(APP + '#/etkinlikler'); await p.waitForTimeout(1500);
  bekle('kartta "Havuzda 1 önerin var"', /Havuzda 1 önerin var/.test(await yazi(p, '.oneri-karti')));
  for (const ad of ['Eller', 'Su']) await B.c.rpc('oneri_birak', { p_ad: ad });
  await p.reload(); await p.waitForTimeout(2000);
  bekle('3 öneride düğme yerine not', (await p.getByRole('button', { name: 'Tema öner' }).count()) === 0 && /Üç önerin havuzda/.test(await yazi(p, '.oneri-karti')));
  // Adrese doğrudan gidip 4. öneriyi bırakmaya çalışınca form sınırı söylüyor (kapsam incelemesi)
  await p.goto(APP + '#/oner'); await p.waitForTimeout(800);
  await p.locator('#oneri-ad').fill('Rüzgar'); await p.getByRole('button', { name: 'Öneriyi bırak' }).click(); await p.waitForTimeout(1200);
  // Üye havuz adresine girerse Profil'e düşüyor (kapsam incelemesi)
  await p.goto(APP + '#/havuz'); await p.waitForTimeout(1500);
  bekle('üye #/havuz açınca havuz yerine Profil', !/Tema\s*havuzu/.test(await yazi(p, '.sc')) && (await p.getByRole('button', { name: 'Çıkış yap' }).count()) === 1, await yazi(p, '.sc'));
  await p.goto(APP + '#/oner'); await p.waitForTimeout(800);
  await p.locator('#oneri-ad').fill('Rüzgar'); await p.getByRole('button', { name: 'Öneriyi bırak' }).click(); await p.waitForTimeout(1200);
  bekle('4. öneride form sınırı söylüyor, formda kalıyor', /Üç önerin havuzda\. Birini geri çekince/.test(await yazi(p, '.sc')) && (await p.evaluate(() => location.hash)) === '#/oner', await yazi(p, '.sc'));
  await p.goto(APP + '#/profil'); await p.waitForTimeout(1500);
  await p.locator('.onerilerim .satir', { hasText: 'Su' }).getByRole('button', { name: 'Geri çek' }).click(); await p.waitForTimeout(1200);
  bekle('geri çekince listeden gitti', !/\bSu\b/.test(await yazi(p, '.onerilerim')));
  // Son inceleme #7: Önerilerin veri gelince beliriyor, Ayarlar ve "Çıkış yap" aşağı kayıyordu
  await p.locator('.tabs button', { hasText: 'Etkinlikler' }).click(); await p.waitForTimeout(1500);
  // Yavaş ağ: bellek yoksa liste 800 ms sonra gelir ve kaydırır
  await p.route('**/rpc/onerilerim', async r => { await new Promise(res => setTimeout(res, 800)); await r.continue(); });
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(60);
  const cy1 = await p.getByRole('button', { name: 'Çıkış yap' }).evaluate(e => e.getBoundingClientRect().top).catch(() => -1);
  await p.waitForTimeout(2000);
  const cy2 = await p.getByRole('button', { name: 'Çıkış yap' }).evaluate(e => e.getBoundingClientRect().top);
  bekle('Profil ikinci açılış: Önerilerin bellekten, "Çıkış yap" kaymıyor (±2px)', Math.abs(cy1 - cy2) <= 2, `${cy1} → ${cy2}`);
  await p.unroute('**/rpc/onerilerim');
  // Yönetici: Profil → havuz, Kurulum'da havuzdan seç
  const q = await sayfa('kurucu@test.local');
  await q.goto(APP + '#/profil'); await q.waitForTimeout(1500);
  bekle('yönetimde "Tema havuzu · 2 öneri"', /Tema havuzu/.test(await yazi(q, '.sc')) && /2 öneri/.test(await yazi(q, '.sc')));
  await q.getByRole('button', { name: /Tema havuzu/ }).click(); await q.waitForTimeout(1200);
  bekle('havuz ekranında öneren adı', /Gece/.test(await yazi(q, '.sc')) && /Barış Ak/.test(await yazi(q, '.sc')));
  bekle('havuz ekranında gerekçe; tek önerende ad tekrarlanmıyor (Buse, 2026-09-30)', /“Işıkların altında”/.test(await yazi(q, '.sc')) && !/“Işıkların altında” · Barış Ak/.test(await yazi(q, '.sc')), await yazi(q, '.sc'));
  await kartDenetle(q, 'havuz', bekle);
  // Kurulumda havuzdan seçim kuralları (kapsam incelemesi): üçüncü kalem için yöneticinin kendi önerisi
  await A.c.rpc('oneri_birak', { p_ad: 'Işık' });
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/kur'); await q.waitForTimeout(1800);
  const kalem = ad => q.locator('.havuz-sec .izin').filter({ has: q.locator('b', { hasText: new RegExp(`^${ad}$`) }) });   // başlıkla birebir: gerekçe metni de eşleşiyordu
  const temalar = () => q.locator('.tema-kur input').evaluateAll(l => l.map(i => i.value));
  await kalem('Gece').click(); await q.waitForTimeout(200);
  await kalem('Gece').click(); await q.waitForTimeout(200);
  bekle('ikinci dokunuş seçimi geri alıyor', JSON.stringify(await temalar()) === '[""]' && (await kalem('Gece').getAttribute('aria-pressed')) === 'false', JSON.stringify(await temalar()));
  await kalem('Gece').click(); await kalem('Eller').click(); await kalem('Işık').click(); await q.waitForTimeout(200);
  bekle('boş yuva yokken yeni tema ekleniyor, üçe kadar', JSON.stringify(await temalar()) === '["Gece","Eller","Işık"]', JSON.stringify(await temalar()));
  await admin.from('tema_onerileri').insert({ ad: 'Sis', anahtar: 'sis', elle: true });
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/kur'); await q.waitForTimeout(1800);
  for (const ad of ['Gece', 'Eller', 'Işık']) await kalem(ad).click();
  await kalem('Sis').click(); await q.waitForTimeout(200);
  bekle('üç tema doluyken dördüncü seçilmiyor', (await temalar()).length === 3 && (await kalem('Sis').getAttribute('aria-pressed')) === 'false', JSON.stringify(await temalar()));
  await q.locator('#t0').fill('Gece yarısı'); await q.waitForTimeout(200);
  bekle('seçilen tema elle değiştirilince öneriyle bağı kopuyor', (await kalem('Gece').getAttribute('aria-pressed')) === 'false', await kalem('Gece').getAttribute('aria-pressed'));
  await admin.from('tema_onerileri').delete().in('anahtar', ['sis', 'ışık']);
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/kur'); await q.waitForTimeout(1500);
  await q.locator('.havuz-sec .izin', { hasText: 'Gece' }).click(); await q.waitForTimeout(300);
  bekle('havuzdan seçince tema alanına yazıldı', (await q.locator('#t0').inputValue()) === 'Gece');
  await q.locator('#yb').fill(new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 16));
  await q.getByRole('button', { name: 'Etkinliği kur' }).click(); await q.waitForTimeout(2500);
  const benim = (await B.c.rpc('onerilerim')).data ?? [];
  bekle('kurunca öneri seçildi oldu', benim.find(x => x.ad === 'Gece')?.durum === 'secildi', JSON.stringify(benim));
  // Yeniden yükleme yerine sekme geçişi: boşta bekleyen sayfada reload uçuştaki isteği kesip sayfa hatası üretiyordu
  await p.locator('.tabs button', { hasText: 'Etkinlikler' }).click(); await p.waitForTimeout(800);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(2000);
  bekle('öneren Profil\'de "Seçildi"', /Seçildi/.test(await yazi(p, '.onerilerim')));
  // Kurulumda öneri bağlanamazsa sessiz kalmıyor (kapsam incelemesi)
  await admin.from('etkinlikler').update({ iptal: true }).neq('id', '00000000-0000-0000-0000-000000000000');
  await q.goto(APP + '#/kur'); await q.reload(); await q.waitForTimeout(2000);
  await q.route('**/rpc/onerileri_bagla', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test"}' }));
  await q.locator('.havuz-sec .izin', { hasText: 'Gece' }).click(); await q.waitForTimeout(300);
  await q.locator('#yb').fill(new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 16));
  await q.getByRole('button', { name: 'Etkinliği kur' }).click(); await q.waitForTimeout(2500);
  bekle('öneri bağlanamazsa söylüyor ve Aşama\'ya geçiş sunuyor', /Seçtiğin öneriler bağlanamadı/.test(await yazi(q, '.sc')) && (await q.getByRole('button', { name: "Aşama'ya geç" }).count()) === 1, await yazi(q, '.sc'));
  // Havuz hata verirse ve boşken (kapsam incelemesi)
  await q.route('**/rpc/havuz', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test"}' }));
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/havuz'); await q.waitForTimeout(1500);
  bekle('havuz okunamazsa hata gösteriliyor, liste yok', (await q.locator('.hata').count()) === 1 && (await q.locator('.satir-kartlari .satir').count()) === 0);
  await q.unroute('**/rpc/havuz');
  await admin.from('tema_onerileri').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/havuz'); await q.waitForTimeout(1500);
  bekle('havuz boşken boş durum kartı', /Havuz boş/.test(await yazi(q, '.sc')), await yazi(q, '.sc'));
  await admin.from('etkinlikler').update({ iptal: true }).neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('tema_onerileri').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await q.goto(APP + '#/profil'); await q.waitForTimeout(600); await q.goto(APP + '#/kur'); await q.waitForTimeout(1500);
  bekle('havuz boşken Kurulum\'da "Havuzdan seç" yok', (await q.locator('.havuz-sec').count()) === 0 && !/Havuzdan seç/.test(await yazi(q, '.sc')));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
