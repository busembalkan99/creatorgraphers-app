import '../../wrapped-pano.css'
import type { ReactNode } from 'react'
import { kartPlani, type KisiselDurum, type Ozet, type SK } from './plan'
import { Dugmeler, Foto, type Kart, type SetTanimi } from './ortak'
import { puan } from './bicim'
import { panoKisalt } from './pano-metin'
import { Alan, Satir, TemaSatirlari, Yan } from './pano-parca'
import { paylasilacakKare } from '../Paylas'

/**
 * Kalkış tabelası (karar 126, spec 2026-10-03_wrapped-kutuphane_v1). Havalimanı panosu gibi harf harf dönen
 * satırlar; Overpass (otoyol levhası harfinden). Kelimeler düz: "kalkış, kapı, indi" yok. Fotoğraf ikinci
 * planda, bilinen bedel. Hangi kartın olduğu plan.ts'te, eski setle aynı.
 */

const EN = 12   // bir satırda en çok harf (spec)

function govde(ust: string, baslik: ReactNode, pano: ReactNode, ek?: { foto?: ReactNode; dip?: ReactNode; alt?: ReactNode }) {
  return (
    <div className="w-ic pano-ic">
      <span className="pano-ust">{ust}</span>
      <div className="pano-baslik">{baslik}</div>
      {ek?.foto && <div className="pano-foto">{ek.foto}</div>}
      <div className="pano">{pano}</div>
      {ek?.dip && <div className="pano-dip">{ek.dip}</div>}
      {ek?.alt}
    </div>
  )
}

export const PANO: SetTanimi = {
  ad: 'pano',
  sinif: 'set-pano',
  kur(v, eylem) {
    const { baglam: b, plan } = kartPlani(v)
    const { ay, yil, etkinlikAdi } = b
    const K: Kart[] = []
    for (const p of plan) {
      if (p.tur === 'acilis') {
        const o = v.ozet
        K.push({
          ad: 'acilis', sinif: 'p-acilis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, 'Sonuçlar panoda', <>
            <Alan ad="Kişi"><Satir metin={String(o.kisi)} en={4} /></Alan>
            <Alan ad="Kare"><Satir metin={String(o.kare)} en={4} gecikme={0.3} /></Alan>
            <Alan ad="Puan"><Satir metin={String(o.puan)} en={4} gecikme={0.6} vurgu /></Alan>
          </>),
        })
      } else if (p.tur === 'tema') {
        const { tema, kazananlar: w, tek } = p
        const esit = w.length > 1
        K.push({
          ad: 'tema', sinif: 'p-tema', sag: tek ? 'Temada tek kare' : `${w[0].oy_sayisi ?? 0} kişi puanladı`,
          govde: govde(etkinlikAdi, esit ? `${tema.ad} temasında ${w.length === 2 ? 'iki' : w.length} birinci` : `${tema.ad} temasının birincisi`, <>
            <Alan ad="Tema"><TemaSatirlari ad={tema.ad} /></Alan>
            {w.map((k, j) => (
              <div key={k.id} className="pano-kayit">
                <Alan ad="Birinci"><Satir metin={panoKisalt(k.sahip_ad)} en={EN} gecikme={0.3 + j * 0.4} /></Alan>
                <Yan>
                  <Alan ad="Puan"><Satir metin={puan(k.ortalama)} en={4} gecikme={0.6 + j * 0.4} /></Alan>
                  <Alan ad="Durum"><Satir metin={esit ? 'Eşit' : '1.'} en={4} gecikme={0.8 + j * 0.4} vurgu /></Alan>
                </Yan>
              </div>
            ))}
          </>, {
            foto: <div className={esit ? 'iki' : undefined}>{w.slice(0, 2).map(k => <Foto key={k.id} k={k} />)}</div>,
            dip: esit ? 'Eşit puan aldılar' : undefined,
          }),
        })
      } else if (p.tur === 'kursu') {
        K.push({
          ad: 'kursu', sinif: 'p-kursu', sag: `Sıralamaya ${p.girdi} kare girdi`,
          govde: govde(etkinlikAdi, p.az ? 'Az farkla' : 'Kürsünün kalanı', <>
            <Alan ad="Tema"><TemaSatirlari ad={p.tema.ad} /></Alan>
            {p.kursu.map((k, j) => (
              <div key={k.id} className="pano-kayit">
                <Alan ad={j ? 'Üçüncü' : 'İkinci'}><Satir metin={panoKisalt(k.sahip_ad)} en={EN} gecikme={0.3 + j * 0.5} /></Alan>
                <Yan>
                  <Alan ad="Puan"><Satir metin={puan(k.ortalama)} en={4} gecikme={0.6 + j * 0.5} /></Alan>
                  <Alan ad="Durum"><Satir metin={`${k.sira}.`} en={3} gecikme={0.8 + j * 0.5} vurgu /></Alan>
                  <Alan ad="Fark"><Satir metin={`−${puan(p.farklar[j])}`} en={4} gecikme={1 + j * 0.5} /></Alan>
                </Yan>
              </div>
            ))}
          </>),
        })
      } else if (p.tur === 'temalar') {
        K.push({
          ad: 'temalar', sinif: 'p-temalar', sag: `${p.toplam} kare`,
          govde: govde(etkinlikAdi, 'Temalar', p.satirlar.map(({ tema, adet, enYuksek }, j) => (
            <div key={tema.id} className="pano-kayit">
              <Alan ad="Tema"><TemaSatirlari ad={tema.ad} gecikme={j * 0.5} /></Alan>
              <Yan>
                <Alan ad="Kare"><Satir metin={String(adet)} en={3} gecikme={0.3 + j * 0.5} /></Alan>
                <Alan ad="En yüksek"><Satir metin={enYuksek ? puan(enYuksek.ortalama) : '—'} en={4} gecikme={0.5 + j * 0.5} vurgu /></Alan>
              </Yan>
            </div>
          ))),
        })
      } else if (p.tur === 'kisisel') {
        K.push(kisisel(p.durum, { ay, yil, etkinlikAdi, ozet: v.ozet, temaSayisi: v.temalar.length }))
      } else {
        K.push({
          ad: 'kapanis', sinif: 'p-kapanis', sag: `${ay} · ${yil}`,
          govde: govde(etkinlikAdi, '', <>
            <Satir metin="Sıradaki" en={10} />
            <Satir metin="etkinlikte" en={10} gecikme={0.3} />
            <Satir metin="görüşürüz" en={10} gecikme={0.6} vurgu />
          </>, { alt: <Dugmeler eylem={eylem} paylas={!!paylasilacakKare(v.kareler)} /> }),
        })
      }
    }
    return K
  },
}

/** Kişinin kartı. Metinler spec'ten (birinci, sırada, girmedi); öteki durumlarda eski setin cümleleri. */
function kisisel(d: KisiselDurum, c: { ay: string; yil: string; etkinlikAdi: string; ozet: Ozet; temaSayisi: number }): Kart {
  const kart = (baslik: string, sag: string, pano: ReactNode, ek?: { foto?: ReactNode; dip?: ReactNode }): Kart =>
    ({ ad: 'kisisel', sinif: 'p-kisisel', sag, govde: govde(`Sen · ${c.ay}`, baslik, pano, ek) })
  // Senin karen: tema, puan, durum. Sıraya girmeyenin durumu boş (karar 52); puanı yalnız ona açık.
  const kayit = (k: SK, j = 0) => (
    <div key={k.id} className="pano-kayit vurgu-kayit">
      <Alan ad="Tema"><TemaSatirlari ad={k.tema_ad} gecikme={j * 0.5} /></Alan>
      <Yan>
        <Alan ad="Puan"><Satir metin={puan(k.ortalama)} en={4} gecikme={0.3 + j * 0.5} /></Alan>
        <Alan ad="Durum"><Satir metin={k.sirali && k.sira != null ? `${k.sira}.` : ''} en={4} gecikme={0.5 + j * 0.5} vurgu /></Alan>
      </Yan>
    </div>
  )
  const fotolar = (l: (SK | null)[], gri = false) => (
    <div className={l.length > 1 ? 'iki' : undefined} style={gri ? { filter: 'grayscale(1) opacity(.55)' } : undefined}>
      {l.filter(Boolean).map(k => <Foto key={k!.id} k={k} />)}
    </div>
  )
  switch (d.tur) {
    case 'birinci': {
      const l = [d.kare, d.ikinci].filter(Boolean) as SK[]
      return kart(d.ortak ? 'Ortak birinci oldun' : d.ikisi ? 'İki temayı sen kazandın' : 'Senin karen birinci',
        `${d.kare.oy_sayisi ?? 0} kişi puanladı`, l.map((k, j) => kayit(k, j)), { foto: fotolar(l) })
    }
    case 'sirali': {
      const l = [d.kare, d.ikinci].filter(Boolean) as SK[]
      return kart(`Senin karen ${d.kare.sira}.`, `${d.kare.oy_sayisi ?? 0} kişi puanladı`, l.map((k, j) => kayit(k, j)), { foto: fotolar(l) })
    }
    case 'girmedi':
      return kart('Senin karen', `${d.kare.oy_sayisi ?? 0} kişi puanladı`, kayit(d.kare), {
        foto: fotolar([d.kare]),
        dip: <>{d.kare.ortalama == null ? 'Bu kareye kimse puan vermemiş' : 'Puanını yalnız sen görüyorsun'}<br />Temada {d.n} kare vardı</>,
      })
    case 'oylanmamis':
      return kart('Senin karen', `${c.ay} · ${d.kare.tema_ad}`, kayit(d.kare), {
        foto: fotolar([d.kare]), dip: <>Bu temayı kimse oylamamış<br />Temada {d.n} kare vardı</>,
      })
    // Öteki durumlar setin kendi sesiyle (Buse onayladı, 2026-10-05)
    case 'cikarildi':
      return kart('Karen sayılmadı', `${c.ay} · ${d.kare.tema_ad}`, <>
        <Alan ad="Tema"><TemaSatirlari ad={d.kare.tema_ad} /></Alan>
        <Alan ad="Durum"><Satir metin="Çıkarıldı" en={9} gecikme={0.4} vurgu /></Alan>
      </>, {
        foto: fotolar([d.kare], true),
        dip: <>{d.kare.cikarma_nedeni || 'Yarışmadan çıkarıldı'}<br />Yöneticiyle konuşabilirsin</>,
      })
    case 'oyverdi':
      return kart('Oy verdin', `${d.adet} / ${c.ozet.kare} kare`, <Yan>
        <Alan ad="Puanladığın"><Satir metin={String(d.adet)} en={4} vurgu /></Alan>
        <Alan ad="Kare"><Satir metin={String(c.ozet.kare)} en={4} gecikme={0.3} /></Alan>
      </Yan>, { dip: 'Sıradaki etkinlikte panoda senin satırın da olsun' })
    default:
      return kart('Bu sefer yoktun', `${c.ay} · ${c.yil}`, <Yan>
        <Alan ad="Kare"><Satir metin={String(c.ozet.kare)} en={4} /></Alan>
        <Alan ad="Tema"><Satir metin={String(c.temaSayisi)} en={3} gecikme={0.3} /></Alan>
      </Yan>, { dip: 'Bir sonraki buluşmada seni de aramızda görmek isteriz' })
  }
}
