import { useEffect, useState } from 'react'
import { sb, sor } from '../lib/supabase'
import type { Etkinlik, Tema } from '../lib/tipler'
import { asama, ayAdi } from '../lib/zaman'
import { git } from '../lib/yol'
import { Ikon } from '../bilesenler/Ikon'
import { izlenmemisWrapped } from './Wrapped'

/**
 * Ana ekranın boş günleri (Buse, 2026-09-26; ideations/creatorgraphers/2026-09-26_bos-ana-sayfa.md).
 * "[Ay] birincileri": son sonuçlanan etkinliğin her temasının birincisi, yatay şerit.
 * "Katıldığın son etkinlik": kare verdiğin son sonuçlanan etkinlikte en iyi karen.
 * İzlenmemiş Wrapped'in etkinliği ikisinde de görünmüyor (karar 39'un sürprizi). Okunamazsa bölümler yok.
 */

interface SonucKare {
  id: string; tema: string; tema_ad: string; tema_sira: number; dosya: string
  sahip_ad: string; benim: boolean; ortalama: number | null; sira: number | null; sirali: boolean; cikarildi: boolean
}
interface Veri {
  birinciler: { e: Etkinlik; baslik: string; temaSayisi: number; kareler: (SonucKare & { url: string | null })[] } | null
  katildigin: { e: Etkinlik; ay: string; kare: SonucKare & { url: string | null } } | null
}

const puanYaz = (n: number | null) => (n == null ? '' : Number(n).toFixed(1).replace('.', ','))

async function oku(etkinlikler: Etkinlik[], temalar: Tema[], benimTemalarim: Set<string>): Promise<Veri> {
  const saklanan = await izlenmemisWrapped(etkinlikler, asama)
  const bitmis = etkinlikler
    .filter(e => !e.iptal && asama(e) === 'sonuc' && e.id !== saklanan)
    .sort((a, b) => Date.parse(b.oylama_biter) - Date.parse(a.oylama_biter))
  const son = bitmis[0]
  const benimEtkinlik = bitmis.find(e => temalar.some(t => t.etkinlik === e.id && benimTemalarim.has(t.id)))
  const sonuclar = new Map<string, SonucKare[]>()
  for (const e of [son, benimEtkinlik]) {
    if (!e || sonuclar.has(e.id)) continue
    const { data, error } = await sb.rpc('sonuc_kareleri', { p_etkinlik: e.id })
    if (error) throw error
    sonuclar.set(e.id, (data ?? []) as SonucKare[])
  }
  const imzala = async <T extends SonucKare>(l: T[]) => {
    const { data } = l.length ? await sb.storage.from('kareler').createSignedUrls(l.map(k => k.dosya), 3600) : { data: [] }
    return l.map((k, i) => ({ ...k, url: data?.[i]?.signedUrl ?? null }))
  }

  let birinciler: Veri['birinciler'] = null
  const bir = son ? (sonuclar.get(son.id) ?? []).filter(k => k.sirali && k.sira === 1 && !k.cikarildi)
    .sort((a, b) => a.tema_sira - b.tema_sira || a.sahip_ad.localeCompare(b.sahip_ad, 'tr')) : []
  if (son && bir.length) birinciler = {
    e: son, baslik: `${son.serbest ? 'Ekstra etkinlik' : ayAdi(son.bulusma_gunu)} birincileri`,
    temaSayisi: new Set(bir.map(k => k.tema)).size, kareler: await imzala(bir),
  }

  let katildigin: Veri['katildigin'] = null
  const benim = benimEtkinlik ? (sonuclar.get(benimEtkinlik.id) ?? []).filter(k => k.benim && !k.cikarildi)
    .sort((a, b) => (a.sirali ? a.sira ?? 99 : 99) - (b.sirali ? b.sira ?? 99 : 99) || (b.ortalama ?? 0) - (a.ortalama ?? 0))[0] : undefined
  if (benimEtkinlik && benim) katildigin = {
    e: benimEtkinlik, ay: benimEtkinlik.serbest ? 'Ekstra etkinlik' : ayAdi(benimEtkinlik.bulusma_gunu), kare: (await imzala([benim]))[0],
  }
  return { birinciler, katildigin }
}

export function Vitrin({ uyeId, etkinlikler, temalar, benimTemalarim }: {
  uyeId: string; etkinlikler: Etkinlik[]; temalar: Tema[]; benimTemalarim: Set<string>
}) {
  const [v, setV] = useState<Veri | null>(null)
  // Dakikalık tazelemede yalnız sonuçlanan etkinlikler ya da kişinin kareleri değişince yeniden okunuyor
  const anahtar = [uyeId, ...etkinlikler.filter(e => !e.iptal && asama(e) === 'sonuc').map(e => e.id), ...[...benimTemalarim].sort()].join(',')
  useEffect(() => {
    let iptal = false
    sor(oku(etkinlikler, temalar, benimTemalarim)).then(d => { if (!iptal) setV(d) }).catch(() => { if (!iptal) setV(null) })
    return () => { iptal = true }
  }, [anahtar]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return null
  const { birinciler: b, katildigin: k } = v
  return (
    <>
      {b && (
        <>
          <h2 className="kart-bas">{b.baslik}<span>{b.temaSayisi} tema</span></h2>
          <div className="vitrin">
            {b.kareler.map(x => (
              <figure key={x.id} className="vt" onClick={() => git(`sonuc/${b.e.id}/kare/${x.id}`)}>
                <span className="buyut"><Ikon ad="buyut" /></span>
                {x.url ? <img src={x.url} alt={`${x.tema_ad} temasının birincisi`} /> : <div className="yer" />}
                <figcaption><b>{x.tema_ad}</b><span>{x.sahip_ad}</span><i>{puanYaz(x.ortalama)}</i></figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {k && (
        <>
          <h2 className="kart-bas">Katıldığın son etkinlik<span>{k.ay}</span></h2>
          <button className="kart katildigin" onClick={() => git(`sonuc/${k.e.id}`)}>
            {k.kare.url ? <img src={k.kare.url} alt="" /> : <span className="yer" />}
            <div className="vt-sayi">
              {k.kare.sirali && <div><b>{k.kare.sira}</b><span>Sıran</span></div>}
              <div><b>{puanYaz(k.kare.ortalama)}</b><span>Puanın</span></div>
              {/* Sıralamaya girmeyen karenin puanını yalnız sahibi görüyor (karar 38) */}
              {!k.kare.sirali && <p>Karen sıralamaya girmedi.</p>}
            </div>
            <span className="ileri"><Ikon ad="sag" /></span>
          </button>
        </>
      )}
    </>
  )
}
