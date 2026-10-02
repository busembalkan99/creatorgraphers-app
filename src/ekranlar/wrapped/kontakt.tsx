import '../../wrapped-kontakt.css'
import type { ReactNode } from 'react'
import { kartPlani, type KisiselDurum, type Ozet, type SK } from './plan'
import { Dugmeler, type Kart, type SetTanimi } from './ortak'
import { puan } from './bicim'
import { Not, Serit } from './kontakt-parca'
import { paylasilacakKare } from '../Paylas'

/**
 * Kontakt baskı (karar 126, spec 2026-10-03_wrapped-kutuphane_v1). Kâğıt zemin, negatif şeridi, yağlı kalemle
 * daire ve not. Başlık ve kenar yazısı Archivo (dar), kalem notu Mansalva (Türkçenin bütün harfleri var).
 * Kelimeler düz: "seçilen, banyoda, rulo" yok. Hangi kartın olduğu plan.ts'te, eski setle aynı.
 */

function govde(ust: string, baslik: ReactNode, icerik: ReactNode, alt?: ReactNode) {
  return (
    <div className="w-ic k-ic">
      <span className="k-ust">{ust}</span>
      <div className="k-baslik">{baslik}</div>
      {icerik}
      {alt && <div className="k-alt">{alt}</div>}
    </div>
  )
}
/** Şeridi ortalamak için baştan ve sondan eşit doldurulmuş liste: [önce..., hedefler..., sonra...] */
const ortala = (once: (SK | null)[], hedef: SK[], sonra: (SK | null)[]) => {
  const n = Math.max(once.length, sonra.length, 1)
  const bas = [...Array(n - once.length).fill(null), ...once]
  const son = [...sonra, ...Array(n - sonra.length).fill(null)]
  return { kareler: [...bas, ...hedef, ...son], secili: hedef.map((_, j) => n + j) }
}

export const KONTAKT: SetTanimi = {
  ad: 'kontakt',
  sinif: 'set-kontakt',
  kur(v, eylem) {
    const { baglam: b, plan } = kartPlani(v)
    const { ay, yil, etkinlikAdi, temaKareleri } = b
    const kenarAy = `${ay} ${yil}`
    const K: Kart[] = []
    for (const p of plan) {
      if (p.tur === 'acilis') {
        const o = v.ozet
        // Açılışta kazananların kareleri, çizgi yok: sonuçlar henüz söylenmiyor
        const kazananlar = b.yarisan.filter(k => k.sirali && k.sira === 1).slice(0, 3)
        // İlk temanın birincisi ortada; kimse oylanmadıysa boş kareler
        const kareler = kazananlar.length ? ortala(kazananlar.slice(1, 2), kazananlar.slice(0, 1), kazananlar.slice(2, 3)).kareler : [null, null, null]
        K.push({
          ad: 'acilis', sinif: 'kt-acilis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, 'Oylar sayıldı',
            <Serit kareler={kareler} kenar={`${o.kisi} kişi · ${o.kare} kare · ${o.puan} puan`} />,
            `${kenarAy} · ${v.temalar.map(t => t.ad).join(', ')}`),
        })
      } else if (p.tur === 'tema') {
        const { tema, kazananlar: w, tek, adet } = p
        const esit = w.length > 1
        const digerleri = temaKareleri(tema.id).filter(k => k.sirali && k.sira != null && k.sira > 1).sort((a, c) => a.sira! - c.sira!)
        const { kareler, secili } = ortala(digerleri.slice(0, 1), w.slice(0, 2), digerleri.slice(1, 2))
        K.push({
          ad: 'tema', sinif: 'kt-tema', sag: tek ? 'Temada tek kare' : `${w[0].oy_sayisi ?? 0} kişi puanladı`,
          govde: govde(etkinlikAdi, esit ? `${tema.ad} temasında ${w.length === 2 ? 'iki' : w.length} birinci` : `${tema.ad} temasının birincisi`, <>
            <Serit kareler={kareler} secili={secili} kucuk={esit} kenar={`${tema.ad} · ${kenarAy}`} />
            <div className="notlar">{w.map((k, j) => <Not key={k.id} gecikme={1.9 + j * 0.5}>{k.sahip_ad} {puan(k.ortalama)}</Not>)}</div>
          </>, esit ? 'Eşit puan aldılar' : `${adet} kare arasından · ${w[0].oy_sayisi ?? 0} kişi puanladı`),
        })
      } else if (p.tur === 'kursu') {
        const { kareler, secili } = ortala([p.ilk], p.kursu, [])
        K.push({
          ad: 'kursu', sinif: 'kt-kursu', sag: `Sıralamaya ${p.girdi} kare girdi`,
          govde: govde(etkinlikAdi, p.az ? 'Az farkla' : 'Kürsünün kalanı', <>
            <Serit kareler={kareler} secili={secili} kucuk kenar={`${p.tema.ad} · ${kenarAy}`} />
            <div className="notlar">{p.kursu.map((k, j) => <Not key={k.id} gecikme={1.9 + j * 0.5}>{k.sahip_ad} {puan(k.ortalama)}</Not>)}</div>
          </>, `Birinciyle fark ${p.farklar.map(f => puan(f)).join(' · ')}`),
        })
      } else if (p.tur === 'temalar') {
        const enCok = Math.max(...p.satirlar.map(s => s.adet), 1)
        K.push({
          ad: 'temalar', sinif: 'kt-temalar', sag: `${p.toplam} kare`,
          govde: govde(etkinlikAdi, 'Hangi temaya kaç kare', (
            <div className="tema-seritler">
              {p.satirlar.map(({ tema, adet, enYuksek }, j) => (
                <div key={tema.id} className="tema-serit">
                  <span className="kenar">{tema.ad} · {adet} kare{enYuksek ? ` · en yüksek ${puan(enYuksek.ortalama)}` : ''}</span>
                  {/* Şeridin boyu kare sayısı kadar; en kalabalık tema tam boy */}
                  <div className="serit-boy" style={{ width: `${Math.max(12, (adet / enCok) * 100)}%`, animationDelay: `${0.3 + j * 0.4}s` }} />
                </div>
              ))}
            </div>
          ), `${p.toplam} kare, ${p.satirlar.length} temada`),
        })
      } else if (p.tur === 'kisisel') {
        K.push(kisisel(p.durum, { ay, etkinlikAdi, kenarAy, ozet: v.ozet, temaSayisi: v.temalar.length }))
      } else {
        K.push({
          ad: 'kapanis', sinif: 'kt-kapanis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, 'Sıradaki etkinlikte görüşürüz', <>
            <Serit kareler={[null, null, null]} kenar="Creatorgraphers" />
            <Dugmeler eylem={eylem} paylas={!!paylasilacakKare(v.kareler)} />
          </>),
        })
      }
    }
    return K
  },
}

/** Kişinin kartı. Metinler spec'ten (birinci, sırada, girmedi); öteki durumlarda eski setin cümleleri. */
function kisisel(d: KisiselDurum, c: { ay: string; etkinlikAdi: string; kenarAy: string; ozet: Ozet; temaSayisi: number }): Kart {
  const kart = (baslik: string, sag: string, icerik: ReactNode, alt?: ReactNode): Kart =>
    ({ ad: 'kisisel', sinif: 'kt-kisisel', kisi: true, sag, govde: govde(`Sen · ${c.ay}`, baslik, icerik, alt) })
  // Kişinin kareleri şeritte; sırada olan(lar) çizili. Sıraya girmeyen çizilmiyor, numarası da yok (karar 52).
  const serit = (l: (SK | null)[], cizili: boolean) => {
    const kareler = l.filter(Boolean) as SK[]
    const { kareler: dizi, secili } = kareler.length > 1
      ? { kareler: [null, ...kareler, null], secili: cizili ? kareler.map((k, j) => (k.sirali ? j + 1 : -1)).filter(j => j > 0) : [] }
      : ortala([], kareler, [])
    return <Serit kareler={dizi} secili={cizili ? secili : []} kucuk={kareler.length > 1} kenar={`${kareler.map(k => k.tema_ad).join(' · ')} · ${c.kenarAy}`} />
  }
  const not = (k: SK) => <div className="notlar"><Not>{k.tema_ad} {puan(k.ortalama)}</Not></div>
  switch (d.tur) {
    case 'birinci':
      return kart(d.ortak ? 'Ortak birinci oldun' : d.ikisi ? 'İki temayı sen kazandın' : 'Senin karen birinci',
        `${d.kare.oy_sayisi ?? 0} kişi puanladı`, <>{serit([d.kare, d.ikinci], true)}{not(d.kare)}</>,
        d.ortak ? `${d.kare.tema_ad} temasında ortak birinci oldun` : undefined)
    case 'sirali':
      return kart(`Senin karen ${d.kare.sira}.`, `${d.kare.oy_sayisi ?? 0} kişi puanladı`,
        <>{serit([d.kare, d.ikinci], true)}{not(d.kare)}</>,
        d.kac > 1 ? `${d.kac} temada sıralamaya girdin` : undefined)
    case 'girmedi':
      return kart('Senin karen', `${d.kare.oy_sayisi ?? 0} kişi puanladı`, <>{serit([d.kare, d.ikinci], false)}{not(d.kare)}</>,
        <>{d.kare.ortalama == null ? 'Bu kareye kimse puan vermemiş' : 'Puanını yalnız sen görüyorsun'} · Temada {d.n} kare vardı</>)
    case 'oylanmamis':
      return kart('Senin karen', `${c.ay} · ${d.kare.tema_ad}`, serit([d.kare, d.ikinci], false),
        <>Bu temayı kimse oylamamış · Temada {d.n} kare vardı</>)
    case 'cikarildi':
      return kart('Karen yarışmada yok', `${c.ay} · ${d.kare.tema_ad}`, <div className="gri">{serit([d.kare], false)}</div>,
        <>Yarışmadan çıkarıldı{d.kare.cikarma_nedeni ? `: ${d.kare.cikarma_nedeni}` : ''}. Puan sayılmadı, yöneticiyle konuşabilirsin.</>)
    case 'oyverdi':
      return kart('Bu ay oy verdin', `${d.adet} / ${c.ozet.kare} kare`,
        <div className="notlar"><Not gecikme={0.6}>{d.hepsi ? 'Bütün kareleri puanladın' : `${d.adet} kareyi puanladın`}</Not></div>,
        'Kare vermedin. Sıradaki etkinliğe mutlaka gel')
    default:
      return kart('Bu etkinlik sensiz geçti', c.etkinlikAdi,
        <Serit kareler={[null, null, null]} kenar={`${c.ozet.kare} kare · ${c.temaSayisi} tema`} />,
        'Bir sonraki buluşmada seni de aramızda görmek isteriz')
  }
}
