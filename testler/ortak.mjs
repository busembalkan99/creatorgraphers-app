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
  const { data: l } = await admin.auth.admin.listUsers();
  let u = l.users.find(x => x.email === eposta);
  if (!u) u = (await admin.auth.admin.createUser({ email: eposta, password: 'test-sifre-1', email_confirm: true, user_metadata: { full_name: ad } })).data.user;
  const c = istemci();
  const { error } = await c.auth.signInWithPassword({ email: eposta, password: 'test-sifre-1' });
  if (error) throw error;
  return { c, id: u.id };
}
export async function sifirla() {
  // test verisini temizle (servis anahtarıyla)
  for (const t of ['kareler', 'temalar', 'etkinlikler', 'istekler', 'uyeler'])
    await admin.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data: o } = await admin.storage.from('kareler').list('', { limit: 1000 });
  for (const e of o ?? []) {
    const { data: t } = await admin.storage.from('kareler').list(e.name, { limit: 1000 });
    for (const tt of t ?? []) {
      const { data: f } = await admin.storage.from('kareler').list(`${e.name}/${tt.name}`, { limit: 1000 });
      if (f?.length) await admin.storage.from('kareler').remove(f.map(x => `${e.name}/${tt.name}/${x.name}`));
    }
  }
}
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
