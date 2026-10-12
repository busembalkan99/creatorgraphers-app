import '../../wrapped-kontakt.css'
import type { ReactNode } from 'react'
import { acilisSeritleri, kapanisYigini, kartPlani, temaDuzeni, temaSeridiKareleri, type KisiselDurum, type Ozet, type SK } from './plan'
import { Dugmeler, Foto, type Kart, type SetTanimi } from './ortak'
import { puan } from './bicim'
import { Baski, Daire, Lup, Not, Serit } from './kontakt-parca'
import { paylasilacakKare } from '../Paylas'

/**
 * Kontakt baskı (karar 126, spec 2026-10-03_wrapped-kutuphane_v1). Kâğıt zemin, negatif şeridi, yağlı kalemle
 * daire ve not. Başlık ve kenar yazısı Archivo (dar), kalem notu Mansalva (Türkçenin bütün harfleri var).
 * Kelimeler düz: "seçilen, banyoda, rulo" yok. Hangi kartın olduğu plan.ts'te, eski setle aynı.
 */

function govde(ust: string, baslik: string, icerik: ReactNode, alt?: ReactNode) {
  return (
    <div className="w-ic k-ic">
      <span className="k-ust">{ust}</span>
      <div className={`k-baslik${baslik.length > 30 ? ' uzun' : ''}${baslik.length > 42 ? ' cok' : ''}`}>{baslik}</div>
      <div className="k-blok">{icerik}</div>
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

/** Şeritlerdeki kare sayısı en çok bir fark ediyor (4+4+2 yerine 4+3+3): üçüncü şerit tek başına büyümesin. */
const dengele = (s: SK[][]) => {
  const hepsi = s.flat(), taban = Math.floor(hepsi.length / s.length), fazla = hepsi.length % s.length
  let i = 0
  return s.map((_, j) => hepsi.slice(i, (i += taban + (j < fazla ? 1 : 0))))
}

export const KONTAKT: SetTanimi = {
  ad: 'kontakt',
  sinif: 'set-kontakt',
  kur(v, eylem) {
    const { baglam: b, plan } = kartPlani(v)
    const { ay, yil, etkinlikAdi, temaKareleri } = b
    const kenarAy = `${ay} ${yil}`
    const K: Kart[] = []
    const duzen = temaDuzeni(plan); let temaSira = 0
    for (const p of plan) {
      if (p.tur === 'acilis') {
        const o = v.ozet
        const seritler = dengele(acilisSeritleri(v.e, v.kareler))
        K.push({
          ad: 'acilis', sinif: 'kt-acilis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, 'Oylar sayıldı', <>
            <div className={`ac-seritler${seritler.length > 2 ? ' tri' : ''}`}>
              {seritler.map((s, j) => (
                // Kare genişliği şeridi kenardan kenara doldursun: az karede kareler büyüyor
                <div key={j} className="ac-serit" style={{ ['--acw' as string]: `${Math.max(118, Math.ceil(460 / s.length) - 9)}px`, animationDelay: `${j * 0.15}s` }}>
                  {s.map(k => <div key={k.id} className="k-kare"><Foto k={k} /></div>)}
                </div>
              ))}
            </div>
            <div className={`ac-sayilar${seritler.length < 3 ? ' buyuk' : ''}`}>
              <div><b>{o.kisi}</b><span>KİŞİ</span></div><div><b>{o.kare}</b><span>KARE</span></div><div><b>{o.puan}</b><span>PUAN</span></div>
            </div>
          </>, `${kenarAy} · ${v.temalar.map(t => t.ad).join(', ')}`),
        })
      } else if (p.tur === 'tema') {
        const { tema, kazananlar: w, tek, adet } = p
        const d = duzen[temaSira++]
        const baslik = d === 'esit' ? `${tema.ad} temasında ${w.length === 2 ? 'iki' : w.length} birinci` : `${tema.ad} temasının birincisi`
        const alt = d === 'esit' ? 'Eşit puan aldılar' : `${adet} kare arasından · ${w[0].oy_sayisi ?? 0} kişi puanladı`
        let icerik: ReactNode
        if (d === 'serit') {
          const digerleri = temaKareleri(tema.id).filter(k => k.sirali && k.sira != null && k.sira > 1).sort((a, c) => a.sira! - c.sira!)
          const { kareler, secili } = ortala(digerleri.slice(0, 1), w.slice(0, 1), digerleri.slice(1, 2))
          icerik = <>
            <div className="dev-serit"><Serit kareler={kareler} secili={secili} kenar={`${tema.ad} · ${kenarAy}`} /></div>
            <div className="notlar"><Not>{w[0].sahip_ad} {puan(w[0].ortalama)}</Not></div>
          </>
        } else if (d === 'baski') {
          const uzun = tema.ad.length > 12
          icerik = <>
            <div className="masa"><Baski k={w[0]} maxW={uzun ? 270 : 310} maxH={uzun ? 200 : 240} aci={-2}>
              <span className="kenar">{tema.ad} · {kenarAy} · 01</span><Daire gecikme={0.7} /></Baski></div>
            <div className="notlar"><Not gecikme={1.5}>{w[0].sahip_ad}</Not><div className="kalem-puan">{puan(w[0].ortalama)}</div></div>
          </>
        } else {
          icerik = <div className="masa esit">{w.slice(0, 2).map((k, j) => (
            <div key={k.id} className="esit-baski">
              <Baski k={k} maxW={152} maxH={190} aci={j ? 3 : -3} gecikme={j * 0.35}><span className="kalem-no">1</span></Baski>
              <Not gecikme={1.3 + j * 0.3}>{k.sahip_ad} {puan(k.ortalama)}</Not>
            </div>))}</div>
        }
        K.push({ ad: 'tema', sinif: `kt-tema kt-${d}`, sag: tek ? 'Temada tek kare' : `${w[0].oy_sayisi ?? 0} kişi puanladı`, govde: govde(etkinlikAdi, baslik, icerik, alt) })
      } else if (p.tur === 'kursu') {
        K.push({
          ad: 'kursu', sinif: 'kt-kursu', sag: `Sıralamaya ${p.girdi} kare girdi`,
          govde: govde(etkinlikAdi, p.az ? 'Az farkla' : 'Kürsünün kalanı', (
            <div className="masa kursu">{p.kursu.map((k, j) => (
              <div key={k.id} className={`kursu-${j + 2}`}>
                <Baski k={k} maxW={j ? 138 : 150} maxH={j ? 190 : 210} aci={j ? 3.5 : -4} gecikme={0.1 + j * 0.35}><span className="kalem-no">{k.sira}</span></Baski>
                <Not gecikme={1.1 + j * 0.3}>{k.sahip_ad} {puan(k.ortalama)}</Not>
              </div>))}</div>
          ), `Birinciyle fark ${p.farklar.map(f => puan(f)).join(' · ')}`),
        })
      } else if (p.tur === 'temalar') {
        K.push({
          ad: 'temalar', sinif: 'kt-temalar', sag: `${p.toplam} kare`,
          govde: govde(etkinlikAdi, 'Hangi temaya kaç kare', (
            <div className="tema-seritler">
              {p.satirlar.map(({ tema, adet, enYuksek }, j) => (
                <div key={tema.id} className="tema-serit">
                  <span className="tema-ad">{tema.ad} · <b>{adet} kare</b></span>
                  <div className="ac-serit tema-kareleri" style={{ ['--acw' as string]: '52px', animationName: 'boy-uza', animationDelay: `${0.1 + j * 0.3}s` }}>
                    {temaSeridiKareleri(v.kareler, tema.id).map(k => <div key={k.id} className="k-kare"><Foto k={k} /></div>)}
                  </div>
                  {enYuksek && <Not gecikme={1 + j * 0.3}>en yüksek {puan(enYuksek.ortalama)}</Not>}
                </div>
              ))}
            </div>
          ), `${p.toplam} kare, ${p.satirlar.length} temada`),
        })
      } else if (p.tur === 'kisisel') {
        const oylanan = (v.oylanan ?? []).map(id => v.kareler.find(k => k.id === id)).filter((k): k is SK => !!k)
        K.push(kisisel(p.durum, { ay, etkinlikAdi, kenarAy, ozet: v.ozet, temaSayisi: v.temalar.length, oylanan }))
      } else {
        const yigin = kapanisYigini(v.kareler)
        K.push({
          ad: 'kapanis', sinif: 'kt-kapanis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, 'Sıradaki etkinlikte görüşürüz', <>
            <div className="masa yigin">{yigin.map((k, j) => (
              <div key={k.id} data-kare={k.id} className="yigin-yer" style={{ ['--y' as string]: j }}>
                <Baski k={k} maxW={150} maxH={180} aci={j === yigin.length - 1 ? -1 : [-12, 9, -5][j % 3]} gecikme={0.1 + j * 0.25} />
              </div>))}</div>
            <Dugmeler eylem={eylem} paylas={!!paylasilacakKare(v.kareler)} />
          </>),
        })
      }
    }
    return K
  },
}

/** Kişinin kartı. Metinler spec'ten (birinci, sırada, girmedi); öteki durumlarda eski setin cümleleri. */
function kisisel(d: KisiselDurum, c: { ay: string; etkinlikAdi: string; kenarAy: string; ozet: Ozet; temaSayisi: number; oylanan: SK[] }): Kart {
  const kart = (baslik: string, sag: string, icerik: ReactNode, alt?: ReactNode): Kart =>
    ({ ad: 'kisisel', sinif: 'kt-kisisel', sag, govde: govde(`Sen · ${c.ay}`, baslik, icerik, alt) })
  // Lüp bloğu: kareler şeritte, lüp hedef karede, numara lübün sol altında (şeridin altında). Karar 52: sıraya girmeyende numara yok.
  // İki kare yan yana (cift); üç ya da daha fazlasında (oy verdin) lüp ortadaki karede geziyor.
  const lupBlok = (l: (SK | null)[], numara: number | null, opt: { gez?: boolean; soluk?: boolean } = {}) => {
    const kareler = l.filter(Boolean) as SK[]
    const cift = kareler.length === 2
    const dizi = cift ? [null, ...kareler, null] : ortala([], kareler.length ? kareler : [null as unknown as SK], []).kareler
    const sagda = cift && numara != null
    const hedef = cift ? (sagda ? 2 : 1) : Math.floor(dizi.length / 2)
    const kayma = cift ? `calc((var(--kb) + 10px) / ${sagda ? 2 : -2})` : '0px'
    return (
      <div className={`lup-blok${cift ? ' cift' : ''}${numara != null ? ' numarali' : ''}`}>
        <div className={opt.soluk ? 'gri' : undefined}>
          <Serit kareler={dizi} secili={cift && numara != null ? [1] : []} kucuk={cift} numarasiz kenar={`${kareler.map(k => k.tema_ad).join(' · ')} · ${c.kenarAy}`} />
        </div>
        {!opt.soluk && <Lup k={dizi[hedef]} boy="var(--lb)" sol={`calc(50% + ${kayma} - var(--lb) / 2)`} ust="calc(56px + var(--kb) / 3 - var(--lb) / 2)" gez={opt.gez} />}
        {numara != null && <span className="kalem-buyuk">{numara}</span>}
      </div>
    )
  }
  const not = (k: SK) => <div className="notlar"><Not>{k.tema_ad} {puan(k.ortalama)}</Not></div>
  switch (d.tur) {
    case 'birinci':
      return kart(d.ortak ? 'Ortak birinci oldun' : d.ikisi ? 'İki temayı sen kazandın' : 'Senin karen birinci',
        `${d.kare.oy_sayisi ?? 0} kişi puanladı`, <>{lupBlok([d.kare, d.ikinci], 1)}{not(d.kare)}</>,
        d.ortak ? `${d.kare.tema_ad} temasında ortak birinci oldun` : undefined)
    case 'sirali':
      return kart(`Senin karen ${d.kare.sira}.`, `${d.kare.oy_sayisi ?? 0} kişi puanladı`,
        <>{lupBlok([d.kare, d.ikinci], d.kare.sira)}{not(d.kare)}</>,
        d.kac > 1 ? `${d.kac} temada sıralamaya girdin` : undefined)
    case 'girmedi':
      return kart('Senin karen', `${d.kare.oy_sayisi ?? 0} kişi puanladı`, <>{lupBlok([d.kare, d.ikinci], null)}{not(d.kare)}</>,
        <>{d.kare.ortalama == null ? 'Bu kareye kimse puan vermemiş' : 'Puanını yalnız sen görüyorsun'} · Temada {d.n} kare vardı</>)
    case 'oylanmamis':
      return kart('Senin karen', `${c.ay} · ${d.kare.tema_ad}`, lupBlok([d.kare, d.ikinci], null),
        <>Bu temayı kimse oylamamış · Temada {d.n} kare vardı</>)
    // Öteki durumlar setin kendi sesiyle (Buse onayladı, 2026-10-05). Çıkarılan kare soluk, üstünde çizgi yok.
    case 'cikarildi':
      return kart('Karen sayılmadı', `${c.ay} · ${d.kare.tema_ad}`,
        <>{lupBlok([d.kare], null, { soluk: true })}<div className="notlar"><Not>{d.kare.cikarma_nedeni || 'Yarışmadan çıkarıldı'}</Not></div></>,
        'Yöneticiyle konuşabilirsin')
    case 'oyverdi':
      return kart('Bu sefer oylayan sendin', `${d.adet} / ${c.ozet.kare} kare`,
        <>{c.oylanan.length > 0 && lupBlok(c.oylanan.slice(0, 3), null, { gez: true })}
          <div className="notlar"><Not>{d.hepsi ? 'Bütün kareleri puanladın' : `${d.adet} kareye puan verdin`}</Not></div></>,
        'Sıradaki etkinlikte senin karen de şeritte olsun')
    default:
      return kart('Bu sefer yoktun', c.etkinlikAdi,
        <>{lupBlok([null, null, null], null)}<div className="notlar"><Not>{c.ozet.kare} kare, {c.temaSayisi} tema</Not></div></>,
        'Bir sonraki buluşmada seni de aramızda görmek isteriz')
  }
}
