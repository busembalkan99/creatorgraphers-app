// kare-adres (karar 127). Kullanıcının oturumuyla çağrılıyor; izin veritabanında (dosya_izni), imza R2 anahtarıyla.
// Gizliler Supabase Function secrets'ta: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (yalnız Buse giriyor).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isle } from './cekirdek.ts'

const env = (k: string) => Deno.env.get(k) ?? ''
const s3 = {
  adres: env('R2_ADRES'), icAdres: env('R2_IC_ADRES') || undefined, kova: env('R2_KOVA'), bolge: env('R2_BOLGE') || 'auto',
  anahtar: env('R2_ACCESS_KEY_ID'), gizli: env('R2_SECRET_ACCESS_KEY'),
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async istek => {
  if (istek.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const baslik = istek.headers.get('authorization') ?? ''
  const kullanici = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { authorization: baslik } } })
  const servis = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
  // verify_jwt herkese açık anon anahtarını da geçiriyor: yalnız gerçek bir kullanıcı oturumu kabul.
  // Jeton servis istemcisiyle soruluyor; kullanıcı istemcisinin sabit başlığı getUser'ın başlığıyla çakışıyor.
  const { data: oturum } = await servis.auth.getUser(baslik.replace(/^Bearer\s+/i, ''))
  if (!oturum?.user) return new Response(JSON.stringify({ hata: 'oturum_yok' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } })
  const r = await isle(await istek.json().catch(() => ({})), { kullanici, uid: oturum.user.id, servis, s3 })
    .catch(() => ({ durum: 500, veri: { hata: 'ic_hata' } }))
  return new Response(JSON.stringify(r.veri), { status: r.durum, headers: { ...cors, 'content-type': 'application/json' } })
})
