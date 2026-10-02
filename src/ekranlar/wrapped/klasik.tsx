import type { CSSProperties, ReactNode } from 'react'
import { kartPlani, adlarYaz, type KisiselDurum, type SK, type Ozet, type Tema } from './plan'
import { Ad, Foto, Rulo, type Kart, type SetTanimi } from './ortak'
import { iki, puan, SAYI, buyuk } from './bicim'
import { paylasilacakKare } from '../Paylas'

/**
 * Eski set (karar 39, spec 2026-09-20): F1 dili, kart başına renk takımı, her kartın kendi hareketi.
 * Karar 126'da kütüphaneye "klasik" olarak taşındı; çizim aynen, hangi kartın olduğu plan.ts'te.
 */

export const KLASIK: SetTanimi = {
  ad: 'klasik',
  sinif: '',
  kur(v, eylem) {
    const { baglam: b, plan } = kartPlani(v)
    const { ay, yil, etkinlikAdi } = b
    const { ozet, kareler, temalar } = v
    const K: Kart[] = []
    for (const p of plan) {
      if (p.tur === 'acilis') {
        K.push({
          ad: 'acilis', sinif: 'k1', sag: `${ay} · ${yil}`,
          govde: (
            <div className="w-ic">
              <span className="w-etiket e1">{etkinlikAdi} / Bitti</span>
              <div className="w-baslik e2">Sonuçlar<br /><span className="vurgu">geldi</span></div>
              <div className="satirlar">
                <div className="w-satir s1"><span className="mono">Kişi<br />katıldı</span><Rulo n={ozet.kisi} cls="" /></div>
                <div className="w-satir s2"><span className="mono">Kare<br />yüklendi</span><Rulo n={ozet.kare} cls="r2" /></div>
                <div className="w-satir s3"><span className="mono">Puan<br />verildi</span><Rulo n={ozet.puan} cls="r3" /></div>
              </div>
            </div>
          ),
        })
      } else if (p.tur === 'tema') {
        const { tema: t, kazananlar: w, tek } = p
        K.push({
          ad: 'tema', sinif: 'k2', sag: tek ? 'Temada tek kare' : `${w[0].oy_sayisi ?? 0} kişi puanladı`,
          govde: (
            <div className="w-ic titre">
              <span className="w-etiket p1">{ay} / {t.ad} / 01</span>
              {w.length > 1 ? (
                <>
                  <div className="w-baslik p2">{t.ad} temasında<br /><span className="vurgu">ortak birinci</span></div>
                  <div className="w-alan p3 w-esit">
                    {w.slice(0, 2).map(k => <div key={k.id} className="cerceve"><Foto k={k} /></div>)}
                  </div>
                  {/* Ortak birincilerin hepsinin adı; kartta en çok iki kare görünüyor ama ad kimseyi dışarıda bırakmıyor (Buse, 2026-10-03) */}
                  <div className="alt-satir"><span className="w-ad p4">{adlarYaz(w.map(k => k.sahip_ad))}<br />eşit puan aldı</span><span className="puan-kutu p5">{puan(w[0].ortalama)}</span></div>
                </>
              ) : (
                <>
                  <div className="w-baslik p2">{t.ad} temasının<br /><span className="vurgu">birincisi</span></div>
                  <div className="w-alan p3"><div className="cerceve" style={{ width: '100%' }}><div className="bant-yapis" /><Foto k={w[0]} /></div></div>
                  <div className="alt-satir"><Ad ad={w[0].sahip_ad} className="p4" /><span className="puan-kutu p5">{puan(w[0].ortalama)}</span></div>
                </>
              )}
            </div>
          ),
        })
      } else if (p.tur === 'kursu') {
        const { tema: t, kursu, farklar, az, girdi } = p
        K.push({
          ad: 'kursu', sinif: 'k3', sag: `Sıralamaya ${girdi} kare girdi`,
          govde: (
            <div className="w-ic">
              <span className="w-etiket">{ay} / {t.ad} / 02{kursu.length > 1 ? '–03' : ''}</span>
              <div className="w-baslik">{az ? <>Az<br /><span className="vurgu">farkla</span></> : <>Kürsünün<br /><span className="vurgu">kalanı</span></>}</div>
              <div className="ikili">
                {kursu.map((k, j) => (
                  <div key={k.id} className={`baski ${j ? 'dus2' : 'dus1'}`}>
                    <div className="cerceve"><div className="bant-yapis yapis" style={{ width: 56, marginLeft: -28, animationDelay: j ? '.6s' : undefined }} /><Foto k={k} /></div>
                    <div className="derece"><span className="w-no">{iki(k.sira ?? 0)}</span><Ad ad={k.sahip_ad} /></div>
                  </div>
                ))}
              </div>
              <div className="fark"><span className="mono">Birinciyle fark</span><span className="mono">{farklar.map(f => puan(f)).join(' · ')}</span></div>
            </div>
          ),
        })
      } else if (p.tur === 'temalar') {
        const sayilar = p.satirlar.map(s => s.adet)
        const blok = Math.max(1, Math.ceil(Math.max(...sayilar) / 14))
        let gecikme = 0
        K.push({
          ad: 'temalar', sinif: 'k4', sag: blok === 1 ? 'Her blok bir kare' : `Her blok ${blok} kare`,
          govde: (
            <>
              <div className="kafa" />
              <div className="w-ic">
                <span className="w-etiket">{ay} / Tema tema</span>
                <div className="w-baslik">İki tema<br /><span className="vurgu">{p.toplam} kare</span></div>
                <div className="tablo">
                  {p.satirlar.map(({ tema: t, adet: sayi, enYuksek: w }, j) => {
                    const adet = Math.ceil(sayi / blok)
                    return (
                      <div key={t.id} className="w-tema-satir">
                        <div className="w-ust"><span className="tema-ad">{t.ad}</span><span className="mono">{sayi} kare{w ? ` · en yüksek ${puan(w.ortalama)}` : ''}</span></div>
                        <div className={`cubuk ${j === 0 ? 'kirmizi' : ''}`}>
                          {Array.from({ length: adet }, (_, x) => <i key={x} style={{ animationDelay: `${((gecikme++) * 0.12).toFixed(2)}s` }} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="dip"><span className="mono">En çok kare</span><span className="mono">{sayilar[0] === sayilar[1] ? 'Eşit' : p.satirlar[sayilar[0] > sayilar[1] ? 0 : 1].tema.ad}</span></div>
              </div>
            </>
          ),
        })
      } else if (p.tur === 'kisisel') {
        K.push(kisiselKart(p.durum, { ay, yil, temalar, kareler, ozet }))
      } else {
        K.push({
          ad: 'kapanis', sinif: 'k6', sag: `${ay} · ${yil}`,
          govde: (
            <div className="w-ic">
              <span className="w-etiket">{etkinlikAdi}</span>
              <div className="w-baslik" style={{ fontSize: 48 }}>Sıradaki<br />etkinlikte<br /><span className="vurgu">görüşürüz</span></div>
              <div className="muhur">Bitti</div>
              <div className="dugmeler">
                <button className="dg w-dolu g1" onClick={eylem.sonuca}>Sonuçlara geç</button>
                {/* Karar 108: paylaşım ekranı Wrapped'le birlikte. Yarışan karesi olmayana kart yok (spec 10.3) */}
                {paylasilacakKare(kareler) && <button className="dg w-bos g2" onClick={eylem.paylas}>Kartını paylaş</button>}
              </div>
              <button className="w-tekrar mono" onClick={eylem.tekrar}>Tekrar izle</button>
            </div>
          ),
        })
      }
    }
    return K
  },
}

function kisiselKart(d: KisiselDurum, { ay, yil, temalar, ozet }:
  { ay: string; yil: string; temalar: Tema[]; kareler: SK[]; ozet: Ozet }): Kart {
  const sonucYaz = (x: SK) => (x.sirali && x.sira != null ? (x.sira === 1 ? 'birinci' : iki(x.sira)) : 'galeride')
  const fotoKart = (k: SK, ikinci: SK | null, ust: ReactNode, satir: ReactNode, alt: ReactNode, sag: string, stil?: CSSProperties): Kart => ({
    ad: 'kisisel', sinif: 'k5', kisi: true, sag,
    govde: (
      <div className="w-ic">
        <span className="w-etiket">Sen / {ikinci ? ay : k.tema_ad}</span>
        <div className="w-baslik">{ust}</div>
        <div className="yarik" />
        {ikinci ? (
          <div className="w-alan w-esit iki-kare">
            {[k, ikinci].map(x => (
              <div key={x.id}>
                <div className="cerceve sari-golge"><Foto k={x} /></div>
                <div className="mono iki-kare-alt">{x.tema_ad} · {sonucYaz(x)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-alan"><div className="cik"><div className="cerceve sari-golge" style={stil}><Foto k={k} /></div></div></div>
        )}
        <div className="w-ad" style={{ marginTop: 20 }}>{satir}</div>
        <div className="alt-satir">{alt}</div>
      </div>
    ),
  })

  switch (d.tur) {
    // A · Temayı kazandın (karar 114 ile iki kare yan yana: iki temayı da kazandıysa metin de ikisini söylüyor)
    case 'birinci': {
      const { kare: k, ikinci, ortak, ikisi } = d
      return fotoKart(k, ikinci,
        ortak ? <>Ortak<br /><span className="vurgu">birinci oldun</span></>
          : ikisi ? <>İki temayı<br /><span className="vurgu">sen kazandın</span></>
          : <>Temayı<br /><span className="vurgu">sen kazandın</span></>,
        ortak ? `${k.tema_ad} temasında ortak birinci oldun`
          : ikisi ? `${k.tema_ad} ve ${ikinci!.tema_ad} temalarının birincisi`
          : `${k.tema_ad} temasının birincisi`,
        <><span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(k.ortalama)}</b></span><span className="no-kutu">01</span></>,
        `${k.oy_sayisi ?? 0} kişi puanladı`)
    }
    // B · Sıralamaya girdin (en iyisi; birden çok temada girdiyse söyleniyor)
    case 'sirali': {
      const { kare: k, ikinci, kac } = d
      return fotoKart(k, ikinci, <>Senin<br /><span className="vurgu">karen</span></>,
        kac > 1 ? <>{buyuk(SAYI[kac] ?? String(kac))} temada<br />sıralamaya girdin</> : `${k.tema_ad} temasında sıralamaya girdin`,
        <><span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(k.ortalama)}</b></span><span className="no-kutu">{iki(k.sira!)}</span></>,
        `${k.oy_sayisi ?? 0} kişi puanladı`)
    }
    // C · Tema hiç oylanmamış
    case 'oylanmamis': {
      const { kare: k, ikinci, n } = d
      return fotoKart(k, ikinci, <>Senin<br /><span className="vurgu">karen</span></>, 'Bu temayı kimse oylamamış',
        <><span className="mono">Puan yok</span><span className="mono" style={{ textAlign: 'right' }}>Temada<br />{n} kare vardı</span></>, `${ay} · ${k.tema_ad}`)
    }
    // C · Sıralamaya girmedi (puanı yalnız kendisine açık, karar 52)
    case 'girmedi': {
      const { kare: k, ikinci, n } = d
      return fotoKart(k, ikinci, <>Senin<br /><span className="vurgu">karen</span></>,
        k.ortalama == null ? 'Bu kareye kimse puan vermemiş' : <>Sıralamaya girmedi, puanını<br />yalnız sen görüyorsun</>,
        <>{k.ortalama == null ? <span className="mono">Puan yok</span> : <span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(k.ortalama)}</b></span>}
          <span className="mono" style={{ textAlign: 'right' }}>Temada<br />{n} kare vardı</span></>,
        `${k.oy_sayisi ?? 0} kişi puanladı`)
    }
    // F · Karen yarışmadan çıkarıldı (başka kimse bu kartı görmez, karar 103)
    case 'cikarildi': {
      const k = d.kare
      return fotoKart(k, null, <>Karen<br /><span className="vurgu">yarışmada yok</span></>,
        <>Yarışmadan çıkarıldı{k.cikarma_nedeni ? <>:<br />{k.cikarma_nedeni}</> : null}</>,
        <><span className="mono">Puan sayılmadı</span><span className="mono" style={{ textAlign: 'right' }}>Yöneticiyle<br />konuşabilirsin</span></>,
        `${ay} · ${k.tema_ad}`, { filter: 'grayscale(1) opacity(.55)' })
    }
    // D · Kare yok, oy var
    case 'oyverdi':
      return {
        ad: 'kisisel', sinif: 'k5', kisi: true, sag: `${d.adet} / ${ozet.kare} kare`,
        govde: (
          <div className="w-ic">
            <span className="w-etiket">Sen / {ay}</span>
            <div className="w-baslik">Bu ay<br /><span className="vurgu">oy verdin</span></div>
            <div className="w-kutu" style={{ marginTop: 32 }}><div className="mono">Puanladığın kare</div><div className="dev" style={{ marginTop: 8 }}>{d.adet}</div></div>
            <div className="w-ad" style={{ marginTop: 24 }}>{d.hepsi ? 'Bütün kareleri puanladın' : `${d.adet} kareyi puanladın`}</div>
            <div className="alt-satir"><span className="mono">Kare vermedin</span><span className="mono" style={{ textAlign: 'right' }}>Sıradaki etkinliğe<br />mutlaka gel</span></div>
          </div>
        ),
      }
    // E · Hiç katılmadın (kulübe sonradan katılan da bunu görür)
    default:
      return {
        ad: 'kisisel', sinif: 'k5', kisi: true, sag: `${ay} · ${yil}`,
        govde: (
          <div className="w-ic">
            <span className="w-etiket">Sen / {ay}</span>
            <div className="w-baslik">Bu etkinlik<br /><span className="vurgu">sensiz geçti</span></div>
            <div className="w-kutu" style={{ marginTop: 32 }}>
              <div className="mono">Kulüp neler yaptı</div><div className="dev" style={{ marginTop: 8 }}>{ozet.kare}</div>
              <div className="mono" style={{ marginTop: 6 }}>kare, {SAYI[temalar.length] ?? temalar.length} temada</div>
            </div>
            <div className="w-ad" style={{ marginTop: 24 }}>Bir sonraki buluşmada seni de<br />aramızda görmek isteriz</div>
            <div className="alt-satir"><span className="mono">Kare yok</span><span className="mono" style={{ textAlign: 'right' }}>Oy yok</span></div>
          </div>
        ),
      }
  }
}
