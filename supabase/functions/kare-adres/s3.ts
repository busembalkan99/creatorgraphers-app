// SigV4 (S3/R2, karar 127), bağımlılıksız: WebCrypto. Deno (Edge Function) ve Node (testler) aynı kodu çalıştırıyor.
// adres yol ön eki taşıyabilir (yerelde Supabase'in S3 servisi: /storage/v1/s3); R2'de ön ek yok.
export type S3Ayar = { adres: string; icAdres?: string; kova: string; bolge: string; anahtar: string; gizli: string }

const te = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const sha = async (v: string | Uint8Array) => hex(await crypto.subtle.digest('SHA-256', typeof v === 'string' ? te.encode(v) : v))
const hmac = async (k: ArrayBuffer | Uint8Array, v: string) =>
  crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), te.encode(v))
// RFC 3986 kodlaması; anahtardaki / korunuyor
const kodla = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
const anahtarKodla = (s: string) => s.split('/').map(kodla).join('/')
const zaman = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')

async function imzaAnahtari(a: S3Ayar, gun: string) {
  let k: ArrayBuffer = await hmac(te.encode('AWS4' + a.gizli), gun)
  k = await hmac(k, a.bolge)
  k = await hmac(k, 's3')
  return hmac(k, 'aws4_request')
}
const yolu = (u: URL, a: S3Ayar, anahtar: string) => `${u.pathname.replace(/\/$/, '')}/${a.kova}/${anahtarKodla(anahtar)}`

/** Süreli adres (tarayıcı kullanıyor). PUT'ta içerik türü (ve verilirse önbellek başlığı) imzaya giriyor:
 *  tarayıcı tam bu başlıklarla göndermezse yüklenemez. */
export async function presign(a: S3Ayar, yontem: 'GET' | 'PUT', anahtar: string, sure: number, icerik?: string, onbellek?: string) {
  const u = new URL(a.adres)
  const t = zaman(), gun = t.slice(0, 8)
  const kapsam = `${gun}/${a.bolge}/s3/aws4_request`
  const imzali: [string, string][] = [...(onbellek ? [['cache-control', onbellek]] : []), ...(icerik ? [['content-type', icerik]] : []), ['host', u.host]] as [string, string][]
  const basliklar = imzali.map(([k]) => k).join(';')
  const sorgu = ([['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'], ['X-Amz-Credential', `${a.anahtar}/${kapsam}`], ['X-Amz-Date', t],
    ['X-Amz-Expires', String(sure)], ['X-Amz-SignedHeaders', basliklar]] as [string, string][])
    .map(([k, v]) => `${kodla(k)}=${kodla(v)}`).sort().join('&')
  const yol = yolu(u, a, anahtar)
  const kanonik = [yontem, yol, sorgu, imzali.map(([k, v]) => `${k}:${v}\n`).join(''), basliklar, 'UNSIGNED-PAYLOAD'].join('\n')
  const yazi = ['AWS4-HMAC-SHA256', t, kapsam, await sha(kanonik)].join('\n')
  const imza = hex(await hmac(await imzaAnahtari(a, gun), yazi))
  return `${u.origin}${yol}?${sorgu}&X-Amz-Signature=${imza}`
}

/** Fonksiyonun kendi isteği (HEAD/DELETE/PUT/GET); icAdres varsa oraya gidiyor. */
export async function s3Istek(a: S3Ayar, yontem: 'HEAD' | 'DELETE' | 'PUT' | 'GET', anahtar: string, govde?: Uint8Array, icerik?: string) {
  const u = new URL(a.icAdres ?? a.adres)
  const t = zaman(), gun = t.slice(0, 8)
  const kapsam = `${gun}/${a.bolge}/s3/aws4_request`
  const ozet = await sha(govde ?? new Uint8Array())
  const b: Record<string, string> = { host: u.host, 'x-amz-content-sha256': ozet, 'x-amz-date': t, ...(icerik ? { 'content-type': icerik } : {}) }
  const adlar = Object.keys(b).sort()
  const yol = yolu(u, a, anahtar)
  const kanonik = [yontem, yol, '', adlar.map(k => `${k}:${b[k]}\n`).join(''), adlar.join(';'), ozet].join('\n')
  const yazi = ['AWS4-HMAC-SHA256', t, kapsam, await sha(kanonik)].join('\n')
  const imza = hex(await hmac(await imzaAnahtari(a, gun), yazi))
  const { host: _host, ...gonder } = b
  return fetch(`${u.origin}${yol}`, {
    method: yontem, body: govde,
    headers: { ...gonder, authorization: `AWS4-HMAC-SHA256 Credential=${a.anahtar}/${kapsam}, SignedHeaders=${adlar.join(';')}, Signature=${imza}` },
  })
}
