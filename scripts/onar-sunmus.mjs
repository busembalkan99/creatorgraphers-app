// Sünmüş kareleri yerinde onarır (2026-09-30). iOS 16 yedek yolu 29-30 Eylül arasında dikey kareleri
// sündürerek kaydetti; oylama açıkken yeniden yükleme yok. Kare kimliği ve oylar aynı kalır: düzeltilmiş dosya
// yeni bir yola yazılıp kareye bağlanır (eski yol tarayıcı ve CDN önbelleğinde kalmasın diye), eski dosya silinir.
//
// Servis anahtarıyla çalışır; anahtar yalnız ortam değişkeninden okunur, hiçbir yere yazılmaz:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/onar-sunmus.mjs listele <üye e-postası>
//     → açık etkinliklerdeki karelerini /tmp/onar/<kare>.jpg olarak indirir, boyutlarını yazar. Bak, karar ver.
//   ... node scripts/onar-sunmus.mjs onar <kare kimliği> <tür>
//     tür: ezik  → kare dik ama yatay bir kutuya ezilmiş (en-boy oranı ters)
//          yan6  → kare yan yatmış ve ezilmiş; saat yönünde 90° çevrilince düzelir
//          yan8  → kare yan yatmış ve ezilmiş; saatin tersine 90° çevrilince düzelir
//   ... node scripts/onar-sunmus.mjs onar <kare> <tür> --dene   → yalnız /tmp/onar/<kare>.onarilmis.jpg yazar, üretime dokunmaz
//   ... node scripts/onar-sunmus.mjs boyut <kare>   → dosya sağlam ama kayıttaki boyut yanlışsa yalnız kaydı düzeltir
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';

const URL_ = process.env.SUPABASE_URL, ANAHTAR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANAHTAR) { console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam değişkeni gerekli.'); process.exit(2); }
const sb = createClient(URL_, ANAHTAR, { auth: { persistSession: false } });
const [komut, a1, a2, a3] = process.argv.slice(2);
fs.mkdirSync('/tmp/onar', { recursive: true });

// JPEG'in gerçek boyutu (SOF işareti)
function jpegBoyut(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], uz = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { g: buf.readUInt16BE(i + 7), y: buf.readUInt16BE(i + 5) };
    i += 2 + uz;
  }
  return null;
}

async function indir(yol) {
  const { data, error } = await sb.storage.from('kareler').download(yol);
  if (error) throw new Error(`indirilemedi ${yol}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Tarayıcıda: ezik → en-boyu ters çevir; yan6/yan8 → önce ham orana aç, sonra çevir. 0,85 JPEG (karar 123).
async function donustur(jpeg, tur) {
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    const s = await p.evaluate(async ([b64, tur]) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
      const W = bmp.width, H = bmp.height;
      const c = document.createElement('canvas');
      c.width = H; c.height = W;   // her üç türde de sonuç en-boyu ters
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      if (tur === 'ezik') x.drawImage(bmp, 0, 0, H, W);
      else {
        // Ham oran H x W (ezilmeden önceki yatay kare), sonra 90° çevir: sonuç W x H... yerine H x W tuvale
        x.translate(c.width / 2, c.height / 2);
        x.rotate(tur === 'yan6' ? Math.PI / 2 : -Math.PI / 2);
        x.drawImage(bmp, -W / 2, -H / 2, W, H);
      }
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const v of u) t += String.fromCharCode(v);
      return { b64: btoa(t), g: c.width, y: c.height };
    }, [jpeg.toString('base64'), tur]);
    return { buf: Buffer.from(s.b64, 'base64'), g: s.g, y: s.y };
  } finally { await b.close(); }
}

if (komut === 'listele') {
  const { data: uye } = await sb.from('uyeler').select('id, ad').eq('eposta', a1).maybeSingle();
  if (!uye) { console.error('Bu e-postayla üye yok.'); process.exit(1); }
  const { data: kareler } = await sb.from('kareler').select('id, dosya, genislik, yukseklik, yukleme_at, temalar!inner(ad, etkinlikler!inner(bulusma_gunu, oylama_biter, iptal))').eq('sahip', uye.id);
  const acik = (kareler ?? []).filter(k => !k.temalar.etkinlikler.iptal && new Date(k.temalar.etkinlikler.oylama_biter) > new Date());
  for (const k of acik) {
    const buf = await indir(k.dosya), d = jpegBoyut(buf);
    fs.writeFileSync(`/tmp/onar/${k.id}.jpg`, buf);
    const uyusmuyor = d && (d.g !== k.genislik || d.y !== k.yukseklik);
    console.log(`${k.id}  kayıt ${k.genislik}x${k.yukseklik}  dosya ${d ? `${d.g}x${d.y}` : '?'}${uyusmuyor ? '  ← UYUŞMUYOR' : ''}  ${k.temalar.ad}  yüklendi ${k.yukleme_at}  → /tmp/onar/${k.id}.jpg`);
  }
  if (!acik.length) console.log('Açık etkinlikte karesi yok.');
} else if (komut === 'boyut') {
  // Dosya sağlam, kayıttaki boyut yanlışsa: yalnız kaydı dosyanın gerçek boyutuna eşitle (kayıpsız)
  const { data: k } = await sb.from('kareler').select('id, dosya, genislik, yukseklik').eq('id', a1).maybeSingle();
  if (!k) { console.error('Kare yok.'); process.exit(1); }
  const d = jpegBoyut(await indir(k.dosya));
  if (!d) { console.error('Dosyanın boyutu okunamadı.'); process.exit(1); }
  if (d.g === k.genislik && d.y === k.yukseklik) { console.log('Kayıt zaten doğru.'); process.exit(0); }
  const { error } = await sb.from('kareler').update({ genislik: d.g, yukseklik: d.y }).eq('id', k.id);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`kayıt ${k.genislik}x${k.yukseklik} → ${d.g}x${d.y} (dosyaya dokunulmadı)`);
} else if (komut === 'onar') {
  const kareId = a1, tur = a2, dene = a3 === '--dene';
  if (!['ezik', 'yan6', 'yan8'].includes(tur)) { console.error('tür: ezik | yan6 | yan8'); process.exit(2); }
  const { data: k } = await sb.from('kareler').select('id, dosya, genislik, yukseklik').eq('id', kareId).maybeSingle();
  if (!k) { console.error('Kare yok.'); process.exit(1); }
  const sonuc = await donustur(await indir(k.dosya), tur);
  fs.writeFileSync(`/tmp/onar/${k.id}.onarilmis.jpg`, sonuc.buf);
  console.log(`${k.genislik}x${k.yukseklik} → ${sonuc.g}x${sonuc.y}  (/tmp/onar/${k.id}.onarilmis.jpg)`);
  if (dene) process.exit(0);
  const klasor = k.dosya.split('/').slice(0, -1).join('/');
  const yeni = `${klasor}/${crypto.randomUUID()}.jpg`;
  const { error: ye } = await sb.storage.from('kareler').upload(yeni, sonuc.buf, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (ye) { console.error('yüklenemedi:', ye.message); process.exit(1); }
  const { error: ge } = await sb.from('kareler').update({ dosya: yeni, genislik: sonuc.g, yukseklik: sonuc.y }).eq('id', k.id);
  if (ge) { await sb.storage.from('kareler').remove([yeni]); console.error('kare güncellenemedi, yeni dosya geri alındı:', ge.message); process.exit(1); }
  await sb.storage.from('kareler').remove([k.dosya]);
  console.log(`onarıldı: kare ${k.id} yeni dosyada, oylar yerinde.`);
} else {
  console.error('kullanım: listele <e-posta> | boyut <kare> | onar <kare> <ezik|yan6|yan8> [--dene]'); process.exit(2);
}
