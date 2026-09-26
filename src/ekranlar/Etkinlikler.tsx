import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Tema, Uye } from '../lib/tipler'
import { asama, ayAdi, gunYaz, kalanYaz, saatEki, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { bellegeYaz, bellektenAl } from '../lib/onbellek'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { wrappedGerekirseAc } from './Wrapped'

/**
 * Ana ekran: etkinlikler arşivi (karar 44). Prototip: v16.
 * Canlı etkinlik en üstte ters çevrilmiş kart, altında geçmiş etkinlikler.
 */

interface Veri {
  etkinlikler: Etkinlik[]
  temalar: Tema[]
  benimTemalarim: Set<string>
  uyeSayisi: number
  oyKalan: { kalan: number; toplam: number } | null   // oylama açıkken kaç kare kaldı
  gelmedim: boolean   // karar 103: açık etkinlikte yoklama alındı ve adım yok
}

export async function etkinlikVerisi(uyeId: string): Promise<Veri> {
  const [e, t, k, u] = await sor(Promise.all([
    sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }),
    sb.from('temalar').select('*').order('sira'),
    sb.from('kareler').select('tema').eq('sahip', uyeId),
    // Çıkarılan üyeler sayılmıyor (karar 99): sayım sunucuda, uye_sayisi() (0008)
    sb.rpc('uye_sayisi'),
  ]))
  const hata = e.error ?? t.error ?? k.error ?? u.error
  if (hata) throw hata
  const etkinlikler = (e.data ?? []) as Etkinlik[]
  const acik = etkinlikler.find(x => asama(x) === 'oylama')
  let oyKalan: { kalan: number; toplam: number } | null = null
  if (acik) {
    const d = await sor(sb.rpc('oylama_durumu', { p_etkinlik: acik.id })).catch(() => ({ error: true, data: null } as const))
    if (!d.error) {
      const satir = (d.data ?? []) as { toplam: number; puanladigim: number }[]
      oyKalan = {
        kalan: satir.reduce((a, x) => a + (Number(x.toplam) - Number(x.puanladigim)), 0),
        toplam: satir.reduce((a, x) => a + Number(x.toplam), 0),
      }
    }
  }
  let gelmedim = false
  const suren = acikEtkinlik(etkinlikler)
  if (suren?.yoklama_at) {
    const y = await sor(sb.rpc('yoklamam', { p_etkinlik: suren.id }))
    if (y.error) throw y.error
    const ben = ((y.data ?? []) as { alindi: boolean; geldim: boolean }[])[0]
    gelmedim = !!ben?.alindi && !ben.geldim
  }
  return {
    etkinlikler,
    gelmedim,
    temalar: (t.data ?? []) as Tema[],
    benimTemalarim: new Set((k.data ?? []).map(r => r.tema as string)),
    uyeSayisi: Number(u.data ?? 0),
    oyKalan,
  }
}

export const acikEtkinlik = (liste: Etkinlik[]) =>
  liste.find(e => ['baslamadi', 'yukleme', 'oylama'].includes(asama(e)))

export function Etkinlikler({ uye }: { uye: Uye }) {
  const [v, setV] = useState<Veri | null>(() => bellektenAl<Veri>(`${uye.id}:etkinlikler`) ?? null)
  const [hata, setHata] = useState<string | null>(null)
  const [, setTik] = useState(0)

  useEffect(() => {
    // Yalnız ilk yükleme hata ekranı açar. Arka plandaki yenilemenin hatası
    // yutulur: zayıf bağlantıda tek kopuk dakika çalışan ekranı hata ekranına
    // çevirip orada bırakıyordu. Başarılı yenileme önceki hatayı da temizler.
    let ilk = true
    const yukle = () => etkinlikVerisi(uye.id)
      .then(d => {
        setV(bellegeYaz(`${uye.id}:etkinlikler`, d)); setHata(null)
        // Karar 39: sonuç açıldıktan sonraki ilk girişte Wrapped kendiliğinden açılır, bir kez
        // Ağ hatası ana ekranı etkilemesin: bir sonraki tazelemede yeniden denenir
        wrappedGerekirseAc(d.etkinlikler, asama).catch(() => {})
      })
      .catch(e => { if (ilk) setHata(hataMetni(e)) })
      .finally(() => { ilk = false })
    yukle()
    // Kalan süre ve aşama dakikada bir yeniden hesaplansın. Veri de tazelensin:
    // yönetici süreyi uzatırsa ya da oylamayı erken açarsa, uygulaması açık olan
    // kişi bunu yenilemeden görmeliydi; saatten hesaplamak eski satırı düzeltmiyor.
    const z = window.setInterval(() => { setTik(x => x + 1); yukle() }, 60_000)
    const gorunur = () => { if (document.visibilityState === 'visible') { setTik(x => x + 1); yukle() } }
    document.addEventListener('visibilitychange', gorunur)
    return () => { window.clearInterval(z); document.removeEventListener('visibilitychange', gorunur) }
  }, [uye.id])

  if (hata) return <div className="sc"><Kunye sol="Creatorgraphers" /><Hata metin={hata} /></div>
  if (!v) return <div className="sc"><Kunye sol="Creatorgraphers" /><Yukleniyor /></div>

  const acik = acikEtkinlik(v.etkinlikler)
  const gecmis = v.etkinlikler.filter(e => e !== acik && !e.iptal)
  const yonetici = uye.rol !== 'uye'

  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" sag={`${v.uyeSayisi} üye`} />
      {acik ? (
        <CanliKart e={acik} temalar={v.temalar.filter(t => t.etkinlik === acik.id)} benim={v.benimTemalarim} oyKalan={v.oyKalan} gelmedim={!!v.gelmedim} />
      ) : (
        <div className="next">
          <span className="k">Sıradaki etkinlik</span>
          <span className="u" style={{ marginLeft: 'auto' }}>henüz kurulmadı</span>
        </div>
      )}
      {!acik && yonetici && (
        <button className="btn ik" onClick={() => git('kur')}>Etkinliği kur</button>
      )}

      <h2 className="sec">Geçmiş etkinlikler<span>{gecmis.length} etkinlik</span></h2>
      {gecmis.length === 0 && <p className="veri">İlk etkinlik bitince burada duracak.</p>}
      {gecmis.map((e, i) => {
        const tm = v.temalar.filter(t => t.etkinlik === e.id)
        // Karar 116: numara yalnız buluşmaları sayıyor (sezonun altı yeri); ekstra etkinlik "EK"
        const no = gecmis.slice(i).filter(x => !x.serbest).length
        return (
          <button className="ev" key={e.id} onClick={() => git(`sonuc/${e.id}`)}>
            <div className="top">
              <span className="no">{e.serbest ? 'EK' : String(no).padStart(2, '0')}</span>
              <span className="mo">{ayAdi(e.bulusma_gunu)}{e.serbest ? ' · ekstra' : ''}</span>
              <span className="mt">{tm.length} tema</span>
            </div>
            <div className="alt">{tm.map(t => t.ad).join(' · ')}{tm.length ? ' · ' : ''}sonuçlar</div>
          </button>
        )
      })}
    </div>
  )
}

function CanliKart({ e, temalar, benim, oyKalan, gelmedim }: { e: Etkinlik; temalar: Tema[]; benim: Set<string>; oyKalan: { kalan: number; toplam: number } | null; gelmedim: boolean }) {
  const a = asama(e)
  const ay = ayAdi(e.bulusma_gunu)
  const tamam = temalar.filter(t => benim.has(t.id)).length
  const ilkBos = temalar.find(t => !benim.has(t.id))

  if (a === 'baslamadi') {
    return (
      <div className="live" data-asama="yukleme">
        <div className="kick">{ay} etkinliği</div>
        <h2>Buluşma<br />{gunYaz(e.bulusma_gunu, false)}</h2>
        {/* Tek cümle olarak okunsun: "Yükleme 19 Eylül 16.00'da açılıyor" */}
        {/* Aradaki {' '}: flex boşluğu yalnız görünüşte ayırıyor, metinde kelimeler
            yapışıyordu ("18.30'daaçılıyor"), ekran okuyucu da öyle okuyordu */}
        <div className="meta">
          <span>Yükleme</span>{' '}
          <b>{saatYaz(e.yukleme_baslar)}'{saatEki(e.yukleme_baslar)}</b>{' '}
          <span>açılıyor</span>
        </div>
        <div className="temalar">{temalar.map(t => `${t.ad}${t.bulusmada ? '' : ' (serbest)'}`).join(' · ')}</div>
        <button className="act" onClick={() => git('yukle')}>Temalara bak</button>
      </div>
    )
  }

  const yukleme = a === 'yukleme'
  const toplam = Date.parse(e.oylama_biter) - Date.parse(e.yukleme_baslar)
  const yuk = Date.parse(e.yukleme_biter) - Date.parse(e.yukleme_baslar)
  const gecen = Date.now() - Date.parse(e.yukleme_baslar)
  const p1 = Math.min(100, (gecen / yuk) * 100)
  const p2 = Math.max(0, Math.min(100, ((gecen - yuk) / (toplam - yuk)) * 100))

  return (
    <div className="live" data-asama={a}>
      <div className="kick">{e.serbest ? `Ekstra etkinlik · ${ay}` : `${ay} etkinliği`} <i><span className="dot" aria-hidden="true" />Canlı</i></div>
      <h2>{yukleme ? <>Yükleme<br />açık</> : <>Oylama<br />açık</>}</h2>
      <div className="meta">
        <span>Kalan</span>{' '}
        <b>{kalanYaz(yukleme ? e.yukleme_biter : e.oylama_biter)}</b>{' '}
        {yukleme && <span>· {tamam} / {temalar.length} tema</span>}
      </div>
      <div className="prog">
        <i><em style={{ width: `${p1}%` }} /></i>
        <i><em style={{ width: `${p2}%` }} /></i>
      </div>
      {yukleme ? (
        <button className="act" onClick={() => git('yukle')}>
          {/* Bütün temalar aynı ekrandan yükleniyor: düğme tek temayı adlandırmıyor (Buse, 2026-09-19) */}
          {gelmedim ? <>Durumuna bak<i>Yoklamada adın yok</i></>
            : tamam === 0 ? (temalar.length > 1 ? 'Karelerini yükle' : 'Kareni yükle')
              : ilkBos ? <>Yüklemeye devam et<i>{temalar.length - tamam} tema kaldı</i></>
                : 'Karelerine bak'}
        </button>
      ) : (
        <button className="act" onClick={() => git('oyla')}>
          {oyKalan == null || oyKalan.kalan === 0
            ? oyKalan == null ? 'Oylamaya geç' : 'Puanlarına bak'
            : oyKalan.kalan === oyKalan.toplam ? 'Oylamaya başla' : 'Oylamaya devam et'}
          {oyKalan != null && oyKalan.kalan > 0 && <i>{oyKalan.kalan} kare kaldı</i>}
        </button>
      )}
    </div>
  )
}
