import { useEffect, useRef, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik } from '../lib/tipler'
import { ayAdi } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { DUZENLER, fontlarHazir, kartBasligi, kartCiz, type Duzen, type KartVeri } from '../lib/paylasimKarti'

/**
 * Paylaşım kartı seçim ekranı (karar 104, B): dört düzen, tek kart ortada, yanlara kaydırmalı.
 * Önizleme ile paylaşılan PNG aynı tuvalden çıkıyor. Seçilen düzen cihazda hatırlanıyor.
 * Yalnız yarışan bir karesi olan görür: kare vermeyene ve karesi çıkarılana kart yok (spec 10.3).
 */

type SK = {
  id: string; tema: string; tema_ad: string; dosya: string; sahip_ad: string; benim: boolean
  ortalama: number | null; oy_sayisi: number | null; sira: number | null; sirali: boolean; cikarildi: boolean
}
const iki = (n: number) => String(n).padStart(2, '0')
const puanYaz = (n: number | null) => (n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const HAFIZA = 'cg-paylasim-duzen'

/** Kişinin paylaşacağı kare: kazandığı > sıralamaya giren en iyisi > girmeyen en yüksek ortalamalı */
export function paylasilacakKare(kareler: SK[]) {
  const benim = kareler.filter(k => k.benim && !k.cikarildi)
  const sirali = benim.filter(k => k.sirali && k.sira != null).sort((a, b) => a.sira! - b.sira! || (b.ortalama ?? 0) - (a.ortalama ?? 0))
  return sirali[0] ?? [...benim].sort((a, b) => (b.ortalama ?? -1) - (a.ortalama ?? -1))[0] ?? null
}

function resimYukle(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise(r => {
    const im = new Image()
    im.crossOrigin = 'anonymous'   // tuvalden PNG alınabilsin
    im.onload = () => r(im)
    im.onerror = () => r(null)
    im.src = url
  })
}

export function Paylas({ etkinlikId }: { etkinlikId: string }) {
  const [kartlar, setKartlar] = useState<{ duzen: Duzen; tuval: HTMLCanvasElement; onizleme: string }[] | null>(null)
  const [dosyaAdi, setDosyaAdi] = useState('creatorgraphers')
  const [yok, setYok] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [i, setI] = useState(() => {
    try { return Math.max(0, DUZENLER.findIndex(d => d.ad === localStorage.getItem(HAFIZA))) } catch { return 0 }
  })
  const [paylasilir, setPaylasilir] = useState(false)
  const basla = useRef<number | null>(null)

  useEffect(() => {
    ;(async () => {
      const [ev, sk, sr] = await sor(Promise.all([
        sb.from('etkinlikler').select('*').eq('id', etkinlikId).maybeSingle(),
        sb.rpc('sonuc_kareleri', { p_etkinlik: etkinlikId }),
        sb.rpc('paylasim_seridi', { p_etkinlik: etkinlikId }),
      ]))
      for (const r of [ev, sk, sr]) if (r.error) throw r.error
      const e = ev.data as Etkinlik | null
      const kareler = (sk.data ?? []) as SK[]
      const k = e ? paylasilacakKare(kareler) : null
      if (!e || !k) return setYok(true)
      const ortak = k.sira === 1 && kareler.filter(x => x.tema === k.tema && x.sirali && x.sira === 1 && !x.cikarildi).length > 1
      const serit = ((sr.data ?? []) as { dosya: string }[]).map(x => x.dosya)
      const yollar = [k.dosya, ...serit]
      const imza = (await sb.storage.from('kareler').createSignedUrls(yollar, 3600)).data ?? []
      const [foto, ...seritResim] = await Promise.all(yollar.map((_, j) => resimYukle(imza[j]?.signedUrl ?? null)))
      await fontlarHazir()
      const v: KartVeri = {
        ay: ayAdi(e.bulusma_gunu), yil: e.bulusma_gunu.slice(0, 4), tema: k.tema_ad, ad: k.sahip_ad,
        baslik: kartBasligi(k.sira, k.sirali, ortak), puan: puanYaz(k.ortalama),
        alt: k.sirali ? `${k.oy_sayisi ?? 0} kişi puanladı` : 'Puanı yalnız sen görüyorsun',
        sira: k.sirali && k.sira != null ? iki(k.sira) : '—',
        temaKare: kareler.filter(x => x.tema === k.tema && !x.cikarildi).length,
        foto, serit: seritResim, tohum: k.id,
      }
      // Test kancası: kartın verisi (yalnız geliştirmede, yayındaki pakette yok)
      if (import.meta.env.DEV) (window as unknown as { __paylasimVeri: KartVeri }).__paylasimVeri = v
      setKartlar(DUZENLER.map(d => {
        const tuval = kartCiz(d.ad, v)
        return { duzen: d.ad, tuval, onizleme: tuval.toDataURL('image/jpeg', 0.86) }
      }))
      setDosyaAdi(`creatorgraphers-${k.tema_ad}`.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/g, '-'))
      // Telefonun paylaşım penceresi dosya kabul ediyor mu? Etmiyorsa yalnız kaydet kalıyor.
      try {
        const deneme = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })
        setPaylasilir(!!navigator.canShare?.({ files: [deneme] }))
      } catch { setPaylasilir(false) }
    })().catch(x => setHata(hataMetni(x)))
  }, [etkinlikId])

  const sec = (j: number) => {
    if (!kartlar || j < 0 || j >= kartlar.length) return
    setI(j)
    try { localStorage.setItem(HAFIZA, kartlar[j].duzen) } catch { /* gizli sekmede yazılamaz */ }
  }
  const png = (): Promise<Blob | null> => new Promise(r => kartlar![i].tuval.toBlob(b => r(b), 'image/png'))
  async function kaydet() {
    const b = await png()
    if (!b) return setHata('Görsel hazırlanamadı. Tekrar dene.')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `${dosyaAdi}-${kartlar![i].duzen}.png`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  async function paylas() {
    const b = await png()
    if (!b) return setHata('Görsel hazırlanamadı. Tekrar dene.')
    try {
      await navigator.share({ files: [new File([b], `${dosyaAdi}-${kartlar![i].duzen}.png`, { type: 'image/png' })] })
    } catch (x) {
      // Kişi pencereyi kapattıysa hata değil
      if ((x as Error)?.name !== 'AbortError') setHata('Paylaşılamadı. Görseli kaydedip kendin paylaşabilirsin.')
    }
  }

  const kunye = <Kunye sol="Sonuçlar" geri={`sonuc/${etkinlikId}`} sag="Paylaş" />
  if (hata && !kartlar) return <div className="sc">{kunye}<Hata metin={hata} /></div>
  if (yok) {
    return (
      <div className="sc">
        {kunye}
        <h2 className="t orta">Paylaşacak<br />karen yok</h2>
        <p className="lede">Kart, bu etkinlikte yarışan karen için hazırlanıyor.</p>
        <button className="btn ik" onClick={() => git(`sonuc/${etkinlikId}`)}>Sonuçlara dön</button>
      </div>
    )
  }
  if (!kartlar) return <div className="sc">{kunye}<Yukleniyor /></div>

  return (
    <div className="sc">
      {kunye}
      <h2 className="t">Kartını paylaş</h2>
      <div className="pk-sahne"
        onPointerDown={ev => { basla.current = ev.clientX }}
        onPointerUp={ev => {
          if (basla.current == null) return
          const dx = ev.clientX - basla.current
          basla.current = null
          if (Math.abs(dx) > 40) sec(dx < 0 ? i + 1 : i - 1)
        }}>
        {i > 0 && <button className="pk-komsu sol" aria-label="Önceki düzen" onClick={() => sec(i - 1)}><img src={kartlar[i - 1].onizleme} alt="" draggable={false} /></button>}
        <img className="pk-kart" src={kartlar[i].onizleme} alt={`${DUZENLER[i].baslik} düzeninde paylaşım kartı`} draggable={false} data-duzen={kartlar[i].duzen} />
        {i < kartlar.length - 1 && <button className="pk-komsu sag" aria-label="Sonraki düzen" onClick={() => sec(i + 1)}><img src={kartlar[i + 1].onizleme} alt="" draggable={false} /></button>}
      </div>
      <div className="pk-nokta" aria-hidden="true">{kartlar.map((_, j) => <i key={j} className={j === i ? 'on' : ''} />)}</div>
      <div className="pk-okno"><b>{DUZENLER[i].baslik}</b><span className="pk-sayac">{i + 1} / {kartlar.length}</span></div>
      {paylasilir && <button className="btn" onClick={paylas}>Paylaş</button>}
      <button className={paylasilir ? 'btn ik' : 'btn'} onClick={kaydet}>Görseli kaydet</button>
      <Hata metin={hata} />
    </div>
  )
}
