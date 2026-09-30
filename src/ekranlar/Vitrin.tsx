import { useEffect, useState } from 'react'
import { sb, sor } from '../lib/supabase'
import type { Etkinlik, Tema } from '../lib/tipler'
import { asama, ayAdi } from '../lib/zaman'
import { git } from '../lib/yol'
import { Ikon } from '../bilesenler/Ikon'
import { izlenmemisWrapped } from './Wrapped'
import { bellegeYaz, bellektenAl } from '../lib/onbellek'
import { kareAdresleri as adresler } from '../lib/imza'

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
    const data = l.length ? await adresler(l.map(k => k.dosya)) : []
    return l.map((k, i) => ({ ...k, url: data?.[i]?.url ?? null }))
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
  // Bellekten: geri dönüşte ilk karede tam boyuyla (boş ekran ve zıplama yok, Buse 2026-09-27)
  const bellekAnahtari = `${uyeId}:vitrin`
  const [v, setV] = useState<Veri | null>(() => bellektenAl<Veri>(bellekAnahtari) ?? null)
  // Yer tutucunun yerini alan içerik yumuşak beliriyor; bellekten gelen zaten yerinde, beliremiyor
  const [yeni, setYeni] = useState(false)
  const [yuklenemedi, setYuklenemedi] = useState(false)
  // Dakikalık tazelemede yalnız sonuçlanan etkinlikler ya da kişinin kareleri değişince yeniden okunuyor
  const anahtar = [uyeId, ...etkinlikler.filter(e => !e.iptal && asama(e) === 'sonuc').map(e => e.id), ...[...benimTemalarim].sort()].join(',')
  useEffect(() => {
    let iptal = false
    sor(oku(etkinlikler, temalar, benimTemalarim))
      .then(d => { if (iptal) return; setYeni(!bellektenAl(bellekAnahtari)); setV(bellegeYaz(bellekAnahtari, d)) })
      .catch(() => { if (!iptal) { setV(null); setYuklenemedi(true) } })
    return () => { iptal = true }
  }, [anahtar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Veri gelene kadar yer tutucular: liste gelecek bölümlerin yerini baştan biliyor, aşağı itilmiyor.
  // Yalnız gösterilecek bir şey varken: sonuçlanmış etkinlik (şerit), onda kişinin karesi (kart).
  const bitmis = etkinlikler.filter(e => !e.iptal && asama(e) === 'sonuc')
    .sort((a, b) => Date.parse(b.oylama_biter) - Date.parse(a.oylama_biter))
  if (!v) {
    if (yuklenemedi || !bitmis.length) return null
    const benimVar = bitmis.some(e => temalar.some(t => t.etkinlik === e.id && benimTemalarim.has(t.id)))
    const son = bitmis[0]
    return (
      <>
        <h2 className="kart-bas">{son.serbest ? 'Ekstra etkinlik' : ayAdi(son.bulusma_gunu)} birincileri</h2>
        <div className="vitrin" aria-hidden="true"><div className="vt yer-kart" /><div className="vt yer-kart" /></div>
        {benimVar && (
          <>
            <h2 className="kart-bas">Katıldığın son etkinlik</h2>
            <div className="kart katildigin yer-kart" aria-hidden="true" />
          </>
        )}
      </>
    )
  }
  const { birinciler: b, katildigin: k } = v
  return (
    <>
      {b && (
        <>
          <h2 className="kart-bas">{b.baslik}<span>{b.temaSayisi} tema</span></h2>
          <div className="vitrin">
            {b.kareler.map(x => (
              <figure key={x.id} className={`vt ${yeni ? 'belir' : ''}`} onClick={() => git(`sonuc/${b.e.id}/kare/${x.id}`)}>
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
          <button className={`kart katildigin ${yeni ? 'belir' : ''}`} onClick={() => git(`sonuc/${k.e.id}`)}>
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
