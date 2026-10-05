import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs';
const env = Object.fromEntries(
  execSync('npx supabase status -o env', { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' })
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
export const URL_ = env.API_URL;
export const ANON = env.ANON_KEY;
const SERVIS = env.SERVICE_ROLE_KEY;
export const admin = createClient(URL_, SERVIS, { auth: { persistSession: false } });
export const istemci = () => createClient(URL_, ANON, { auth: { persistSession: false } });
export async function kullanici(eposta, ad) {
  // Varsayılan sayfa 50 kişi; test kullanıcıları bunu geçince var olanı bulamayıp yeniden kurmaya çalışıyordu
  const { data: l } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let u = l.users.find(x => x.email === eposta);
  if (!u) u = (await admin.auth.admin.createUser({ email: eposta, password: 'test-sifre-1', email_confirm: true, user_metadata: { full_name: ad } })).data.user;
  const c = istemci();
  const { error } = await c.auth.signInWithPassword({ email: eposta, password: 'test-sifre-1' });
  if (error) throw error;
  return { c, id: u.id };
}
// Kovayı her derinlikte boşaltıyor (klasörlerin id'si yok, dosyaların var)
async function bosalt(kova, klasor = '') {
  const { data } = await admin.storage.from(kova).list(klasor, { limit: 1000 });
  const yol = x => (klasor ? `${klasor}/${x.name}` : x.name);
  const dosyalar = (data ?? []).filter(x => x.id).map(yol);
  if (dosyalar.length) await admin.storage.from(kova).remove(dosyalar);
  for (const k of (data ?? []).filter(x => !x.id)) await bosalt(kova, yol(k));
}
export async function sifirla() {
  // test verisini temizle (servis anahtarıyla)
  // Bildirim ve tema önerisi tabloları (0019): kullanıcılar test başına yeniden kullanıldığı için elle
  await admin.from('bildirim_kuyrugu').delete().neq('id', -1);
  for (const t of ['bildirim_abonelikleri', 'tema_onerileri'])
    await admin.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  for (const t of ['kareler', 'temalar', 'etkinlikler', 'istekler', 'uyeler'])
    await admin.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await bosalt('kareler');
  await bosalt(R2);
}
// Kareler R2'de (karar 127). Yerelde "R2" yerel Supabase'in r2-yerel kovası (scripts/yerel-r2.sh); testler
// dosyayı servis rolüyle doğrudan oraya koyuyor ve sahipliğini dosyalar'a yazıyor (kare-adres'in onayla'sının yaptığı).
const R2 = 'r2-yerel';
export const depo = {
  async koy(yol, govde, sahip) {
    const r = await admin.storage.from(R2).upload(yol, govde, { contentType: 'image/jpeg', upsert: true });
    if (r.error) throw r.error;
    const d = await admin.from('dosyalar').upsert({ yol, sahip, etkinlik: yol.split('/')[0], boyut: govde.length });
    if (d.error) throw d.error;
    return { data: { path: yol }, error: null }; // Supabase upload cevabının biçimi: çağıranlar .error'a bakıyor
  },
  async al(yol) {
    const { data } = await admin.storage.from(R2).download(yol);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  },
  async var(yol) { return !!(await depo.al(yol)); },
  async listele(klasor) {
    const { data } = await admin.storage.from(R2).list(klasor, { limit: 1000 });
    return (data ?? []).filter(x => x.id).map(x => x.name);
  },
  async sil(yollar) {
    await admin.storage.from(R2).remove(yollar);
    await admin.from('dosyalar').delete().in('yol', yollar);
  },
};

// Okuma izni (kare-adres'in oku'sunun sorduğu soru): c'nin okuyabildiği yollar, kümesi
export const okunur = async (c, yollar) =>
  new Set(((await c.rpc('dosya_izni', { p_yollar: yollar, p_islem: 'oku' })).data ?? []));

export const sonuclar = [];
export function bekle(ad, kosul, ayrinti = '') {
  sonuclar.push({ ad, ok: !!kosul, ayrinti: kosul ? '' : ayrinti });
}
export function rapor() {
  for (const s of sonuclar) console.log(s.ok ? 'GEÇTİ ' : 'KALDI ', s.ad, s.ayrinti ? '→ ' + s.ayrinti : '');
  const k = sonuclar.filter(s => !s.ok).length;
  console.log(`\n${sonuclar.length - k}/${sonuclar.length} geçti`);
  process.exitCode = k ? 1 : 0;
}

/** Yerel R2 ayarları (scripts/yerel-r2.sh üretiyor; karar 127). Değerler yerel CLI varsayılanları. */
export function yerelS3() {
  const yol = new URL('../supabase/functions/.env.yerel', import.meta.url).pathname;
  const e = Object.fromEntries(fs.readFileSync(yol, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return { adres: e.R2_ADRES, kova: e.R2_KOVA, bolge: e.R2_BOLGE, anahtar: e.R2_ACCESS_KEY_ID, gizli: e.R2_SECRET_ACCESS_KEY };
}
