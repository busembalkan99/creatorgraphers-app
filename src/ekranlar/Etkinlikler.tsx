import { useEffect, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import type { Etkinlik, Tema, Uye } from '../lib/tipler'
import { asama, ayAdi, gunYaz, kalanYaz, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Ana ekran: etkinlikler arşivi (karar 44). Prototip: v16.
 * Canlı etkinlik en üstte ters çevrilmiş kart, altında geçmiş etkinlikler.
 */

interface Veri {
  etkinlikler: Etkinlik[]
  temalar: Tema[]
  benimTemalarim: Set<string>
  uyeSayisi: number
}

export async function etkinlikVerisi(uyeId: string): Promise<Veri> {
  const [e, t, k, u] = await Promise.all([
    sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }),
    sb.from('temalar').select('*').order('sira'),
    sb.from('kareler').select('tema').eq('sahip', uyeId),
    sb.from('uyeler').select('id', { count: 'exact', head: true }),
  ])
  const hata = e.error ?? t.error ?? k.error ?? u.error
  if (hata) throw hata
  return {
    etkinlikler: (e.data ?? []) as Etkinlik[],
    temalar: (t.data ?? []) as Tema[],
    benimTemalarim: new Set((k.data ?? []).map(r => r.tema as string)),
    uyeSayisi: u.count ?? 0,
  }
}

export const acikEtkinlik = (liste: Etkinlik[]) =>
  liste.find(e => ['baslamadi', 'yukleme', 'oylama'].includes(asama(e)))

export function Etkinlikler({ uye }: { uye: Uye }) {
  const [v, setV] = useState<Veri | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [, setTik] = useState(0)

  useEffect(() => {
    etkinlikVerisi(uye.id).then(setV).catch(e => setHata(hataMetni(e)))
    // Kalan süre ve aşama dakikada bir yeniden hesaplansın
    const z = window.setInterval(() => setTik(x => x + 1), 60_000)
    return () => window.clearInterval(z)
  }, [uye.id])

  if (hata) return <div className="sc"><Kunye sol="Creatographers" /><Hata metin={hata} /></div>
  if (!v) return <Yukleniyor />

  const acik = acikEtkinlik(v.etkinlikler)
  const gecmis = v.etkinlikler.filter(e => e !== acik && !e.iptal)
  const yonetici = uye.rol !== 'uye'

  return (
    <div className="sc">
      <Kunye sol="Creatographers" sag={`${v.uyeSayisi} üye`} />
      {acik ? (
        <CanliKart e={acik} temalar={v.temalar.filter(t => t.etkinlik === acik.id)} benim={v.benimTemalarim} />
      ) : (
        <div className="next">
          <span className="k">Sıradaki etkinlik</span>
          <span className="u" style={{ marginLeft: 'auto' }}>henüz kurulmadı</span>
        </div>
      )}
      {!acik && yonetici && (
        <button className="btn ik" onClick={() => git('kur')}>Etkinliği kur</button>
      )}

      <div className="sec">Geçmiş etkinlikler<span>{gecmis.length} etkinlik</span></div>
      {gecmis.length === 0 && <p className="veri">İlk etkinlik bitince burada duracak.</p>}
      {gecmis.map((e, i) => {
        const tm = v.temalar.filter(t => t.etkinlik === e.id)
        return (
          <div className="ev" key={e.id}>
            <div className="top">
              <span className="no">{String(gecmis.length - i).padStart(2, '0')}</span>
              <span className="mo">{ayAdi(e.bulusma_gunu)}</span>
              <span className="mt">{tm.length} tema</span>
            </div>
            <div className="alt">{tm.map(t => t.ad).join(' · ')}</div>
          </div>
        )
      })}
    </div>
  )
}

function CanliKart({ e, temalar, benim }: { e: Etkinlik; temalar: Tema[]; benim: Set<string> }) {
  const a = asama(e)
  const ay = ayAdi(e.bulusma_gunu)
  const tamam = temalar.filter(t => benim.has(t.id)).length
  const ilkBos = temalar.find(t => !benim.has(t.id))

  if (a === 'baslamadi') {
    return (
      <div className="live" data-asama="yukleme">
        <div className="kick">{ay} etkinliği</div>
        <h2>Buluşma<br />{gunYaz(e.bulusma_gunu, false)}</h2>
        <div className="meta"><span>Yükleme</span><b>{saatYaz(e.yukleme_baslar)}</b><span>· açılıyor</span></div>
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
      <div className="kick">{ay} etkinliği <i><span className="dot" aria-hidden="true" />Canlı</i></div>
      <h2>{yukleme ? <>Yükleme<br />açık</> : <>Oylama<br />açık</>}</h2>
      <div className="meta">
        <span>Kalan</span>
        <b>{kalanYaz(yukleme ? e.yukleme_biter : e.oylama_biter)}</b>
        {yukleme && <span>· {tamam} / {temalar.length} tema</span>}
      </div>
      <div className="prog">
        <i><em style={{ width: `${p1}%` }} /></i>
        <i><em style={{ width: `${p2}%` }} /></i>
      </div>
      {yukleme ? (
        <button className="act" onClick={() => git('yukle')}>
          {ilkBos ? `${ilkBos.ad} için kare yükle` : 'Karelerine bak'}
        </button>
      ) : (
        <>
          <div className="not">Oylama ekranı çok yakında burada açılacak.</div>
          <button className="act" onClick={() => git('yukle')}>Karelerine bak</button>
        </>
      )}
    </div>
  )
}
