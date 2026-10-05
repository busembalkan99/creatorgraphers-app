// Yükleme ekranında depo hataları (karar 127, src/lib/depo.ts): kare-adres'in hata kodu ekrana ulaşıyor,
// tam boy PUT'u düşerse onay istenmiyor, kaydedilemeyen karenin iki dosyası siliniyor, silme hatası Kaldır'ı durdurmuyor.
// Ön koşul: yerel Supabase, npx supabase functions serve, npm run dev, node testler/exifjpeg.mjs
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data;
const tema = (await admin.from('temalar').insert({ etkinlik: e.id, ad: 'Serbest', sira: 1, bulusmada: false }).select('id').single()).data;

const dosyaVar = async yol => {
  const klasor = yol.split('/').slice(0, -1).join('/'), ad = yol.split('/').pop();
  return !!((await admin.storage.from('r2-yerel').list(klasor, { search: ad })).data ?? []).find(x => x.name === ad);
};
const kareYolu = async () => (await admin.from('kareler').select('dosya').eq('tema', tema.id).eq('sahip', A.id).maybeSingle()).data?.dosya ?? null;
const onizleme = y => y.replace(/\.jpg$/, '.k.jpg');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
const kareAdres = u => u.pathname.endsWith('/functions/v1/kare-adres');
const govde = r => { try { return r.request().postDataJSON() ?? {}; } catch { return {}; } };

const b = await webkit.launch(); const hatalar = [];
try {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  // kare-adres'e giden işleri sayıyoruz (yönlendirme olmadan da)
  const isler = [];
  p.on('request', r => { if (kareAdres(new URL(r.url())) && r.method() === 'POST') { try { isler.push(r.postDataJSON()); } catch { /* gövdesiz */ } } });
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  await p.goto(APP + '#/yukle'); await p.reload(); await p.waitForTimeout(2500);
  const giris = p.locator('input[type=file]');
  const yukle = async ad => { await giris.setInputFiles(`/tmp/cgapp/${ad}.jpg`); await p.waitForTimeout(300); await p.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1000); };

  // 1) Kare kaydı düşerse R2'ye konan iki dosya da siliniyor
  let kayitDustu = 0;
  const kareKaydi = u => /\/rest\/v1\/kareler/.test(u.pathname);
  await p.route(kareKaydi, r => {
    if (r.request().method() !== 'POST') return r.continue();
    kayitDustu++;
    return r.fulfill({ status: 500, headers: CORS, contentType: 'application/json', body: JSON.stringify({ message: 'test', code: 'XX000' }) });
  });
  isler.length = 0;
  await yukle('dogru');
  await p.unroute(kareKaydi);
  const yol1 = isler.find(g => g.is === 'yukle' && !g.yol.endsWith('.k.jpg'))?.yol;
  bekle('kare kaydı denendi ve düştü (kontrol)', kayitDustu > 0 && !!yol1 && !(await kareYolu()), `${kayitDustu} ${yol1}`);
  bekle('kayıt düşünce silme iki dosyayı da istedi', isler.some(g => g.is === 'sil' && g.yollar?.includes(yol1) && g.yollar?.includes(onizleme(yol1))), JSON.stringify(isler.filter(g => g.is === 'sil')));
  bekle('kayıt düşünce tam boy R2den silindi', yol1 && !(await dosyaVar(yol1)));
  bekle('kayıt düşünce önizleme R2den silindi', yol1 && !(await dosyaVar(onizleme(yol1))));

  // 2) kare-adres'in hata gövdesi {hata:'yukleme_kapali'} ekrana bildik metinle geliyor
  const yuklemeIzni = async r => {
    const g = govde(r);
    if (r.request().method() !== 'POST' || g.is !== 'yukle') return r.continue();
    return r.fulfill({ status: 403, headers: CORS, contentType: 'application/json', body: JSON.stringify({ hata: 'yukleme_kapali' }) });
  };
  await p.route(kareAdres, yuklemeIzni);
  await yukle('donuk');
  await p.unroute(kareAdres, yuklemeIzni);
  bekle('kare-adres yukleme_kapali derse ekran "Yükleme kapalı" diyor', await p.getByText('Yükleme kapalı, kareler artık değişmiyor.').isVisible(), (await p.locator('body').innerText()).slice(0, 300));

  // 3) Tam boyun PUT'u düşerse onay istenmiyor, ekran "Kare yüklenemedi" diyor
  const tamBoyPut = u => u.pathname.endsWith('.jpg') && !u.pathname.endsWith('.k.jpg') && u.searchParams.has('X-Amz-Signature');
  let putDustu = 0;
  await p.route(tamBoyPut, r => { if (r.request().method() !== 'PUT') return r.continue(); putDustu++; return r.fulfill({ status: 500, headers: CORS, body: 'test' }); });
  isler.length = 0;
  await yukle('buyuk');
  await p.unroute(tamBoyPut);
  bekle('tam boy PUT düştü (kontrol)', putDustu > 0, String(putDustu));
  bekle('tam boy PUT düşünce onay istenmiyor', !isler.some(g => g.is === 'onayla'), JSON.stringify(isler));
  bekle('tam boy PUT düşünce ekran "Kare yüklenemedi. Tekrar dene." diyor', await p.getByText('Kare yüklenemedi. Tekrar dene.').isVisible());
  bekle('tam boy PUT düşünce kare kaydı yok', !(await kareYolu()));

  // 4) kare-adres sil 500 dönse de Kaldır kareyi kaldırıyor
  await yukle('dikey');
  const yol4 = await kareYolu();
  bekle('kare yüklendi (kontrol)', !!yol4, String(yol4));
  let silDustu = 0;
  const silme = async r => {
    const g = govde(r);
    if (r.request().method() !== 'POST' || g.is !== 'sil') return r.continue();
    silDustu++;
    return r.fulfill({ status: 500, headers: CORS, contentType: 'application/json', body: JSON.stringify({ hata: 'ic_hata' }) });
  };
  await p.route(kareAdres, silme);
  await p.getByRole('button', { name: /Kaldır/ }).first().click(); await p.waitForTimeout(300);
  await p.locator('.ret button.btn', { hasText: 'Kaldır' }).click(); await p.waitForTimeout(1500);
  await p.unroute(kareAdres, silme);
  bekle('silme isteği 500 döndü (kontrol)', silDustu > 0, String(silDustu));
  bekle('silme düşse de kare kaydı gitti', !(await kareYolu()));
  bekle('silme düşse de ekranda kare kalmadı (Değiştir yok)', (await p.getByRole('button', { name: /Değiştir/ }).count()) === 0);
  bekle('silme düşse de ekran hata göstermiyor', !(await p.getByText('Bir şey ters gitti. Tekrar dene.').isVisible()));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
