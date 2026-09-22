import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik } from '../lib/tipler'
import { asama, kalanYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Ikon } from '../bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Tahmin oyunu (karar 76, karar 106). Prototip: prototype/creatorgraphers/2026-09-12_v18-tahmin-oyunu.html
 * Oylamasını bitiren oynar, başlatmak puanlarını kilitler. Doğru cevaplar sonuçlarla açılıyor:
 * oylama sürerken sunucu ne doğruyu ne de "doğru/yanlış"ı gönderiyor (0014).
 */

export type TahminDurumu = { durum: string; basladi: boolean; gonderildi: boolean; soru: number; cevaplanan: number }
type Aday = { uye: string; ad: string }
type Soru = {
  sira: number; kare: string; dosya: string; genislik: number; yukseklik: number; tema_ad: string
  adaylar: Aday[]; cevap: string | null; gecti: boolean; url?: string | null
}
type SonucSatir = {
  sira: number; kare: string; dosya: string; genislik: number; yukseklik: number; tema_ad: string
  sahip_ad: string; cevap_ad: string | null; gecti: boolean; dogru: boolean; sayildi: boolean; url?: string | null
}

const iki = (n: number) => String(n).padStart(2, '0')

async function imzala<T extends { dosya: string }>(l: T[]): Promise<(T & { url: string | null })[]> {
  const imza = l.length ? (await sb.storage.from('kareler').createSignedUrls(l.map(x => x.dosya), 3600)).data ?? [] : []
  return l.map((x, i) => ({ ...x, url: imza[i]?.signedUrl ?? null }))
}

export function Tahmin({ etkinlikId }: { etkinlikId: string }) {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [d, setD] = useState<TahminDurumu | null>(null)
  const [sorular, setSorular] = useState<Soru[]>([])
  const [sonuc, setSonuc] = useState<SonucSatir[] | null>(null)
  const [secim, setSecim] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [gidiyor, setGidiyor] = useState(false)

  async function oku() {
    const [ev, du] = await sor(Promise.all([
      sb.from('etkinlikler').select('*').eq('id', etkinlikId).maybeSingle(),
      sb.rpc('tahmin_durumu', { p_etkinlik: etkinlikId }),
    ]))
    if (ev.error) throw ev.error
    if (du.error) throw du.error
    const et = (ev.data ?? null) as Etkinlik | null
    const dd = ((du.data ?? []) as TahminDurumu[])[0] ?? null
    if (et && asama(et) === 'sonuc' && dd?.basladi) {
      const { data, error } = await sor(sb.rpc('tahmin_sonucum', { p_etkinlik: etkinlikId }))
      if (error) throw error
      setSonuc(await imzala((data ?? []) as SonucSatir[]))
    } else if (dd?.basladi) {
      const { data, error } = await sor(sb.rpc('tahmin_sorularim', { p_etkinlik: etkinlikId }))
      if (error) throw error
      setSorular(await imzala((data ?? []) as Soru[]))
    }
    setD(dd)
    setE(et)
  }
  useEffect(() => { oku().catch(x => setHata(hataMetni(x))) }, [etkinlikId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function baslat() {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('tahmin_baslat', { p_etkinlik: etkinlikId })
    if (error) { setGidiyor(false); return setHata(hataMetni(error)) }
    await oku().catch(x => setHata(hataMetni(x)))
    setGidiyor(false)
  }

  async function cevapla(s: Soru, gec: boolean) {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('tahmin_cevapla', {
      p_etkinlik: etkinlikId, p_sira: s.sira, p_cevap: gec ? null : secim, p_gec: gec,
    })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    setSorular(l => l.map(x => (x.sira === s.sira ? { ...x, cevap: gec ? null : secim, gecti: gec } : x)))
    setSecim(null)
  }

  if (hata && e === undefined) return <div className="sc"><Kunye sol="Oylama" geri="oyla" sag="Tahmin" /><Hata metin={hata} /></div>
  if (e === undefined) return <Yukleniyor />
  if (!e || !d) {
    return (
      <div className="sc">
        <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Tahmin" />
        <h2 className="t orta">Oyun<br />bulunamadı</h2>
      </div>
    )
  }

  const a = asama(e)

  // ------------------------------------------------ sonuç: kareler kimindi
  if (a === 'sonuc') {
    if (!sonuc || !d.basladi) {
      return (
        <div className="sc">
          <Kunye sol="Sonuçlar" geri={`sonuc/${etkinlikId}`} sag="Tahmin" />
          <h2 className="t orta">Bu etkinlikte<br />oynamadın</h2>
          <p className="lede">Tahmin oyunu oylama sürerken oynanıyor. Bir sonraki etkinlikte oylamanı bitirince açılır.</p>
          <button className="btn ik" onClick={() => git(`sonuc/${etkinlikId}`)}>Sonuçlara dön</button>
        </div>
      )
    }
    const sayilan = sonuc.filter(x => x.sayildi)
    const dogru = sayilan.filter(x => x.dogru).length
    return (
      <div className="sc">
        <Kunye sol="Sonuçlar" geri={`sonuc/${etkinlikId}`} sag="Tahmin" />
        <div className="tahmin-skor">
          <b>{dogru}/{sayilan.length}</b>
          <span>Doğru bildin</span>
        </div>
        <p className="veri" style={{ marginTop: 12 }}>Bu skoru yalnız sen görüyorsun.</p>
        <h2 className="sec">Kareler kimindi<span>{sonuc.length} kare</span></h2>
        {sonuc.map(x => (
          <div key={x.sira} className={`tahmin-satir ${x.dogru ? 'dogru' : ''}`}>
            {x.url ? <img src={x.url} alt="" /> : <div className="yer" />}
            <div className="tx">
              <b>{x.sahip_ad}</b>
              <span>{x.tema_ad} · {x.gecti ? 'geçtin' : `senin tahminin: ${x.cevap_ad ?? '—'}`}</span>
              {!x.sayildi && <span>Yarışmadan çıkarıldı, skora girmedi</span>}
            </div>
            {/* Doğruda tik; yanlışta hiçbir işaret yok, kırmızı da yok (spec 4. bölüm) */}
            {x.dogru && <span className="tik"><Ikon ad="tik" /></span>}
          </div>
        ))}
        <button className="btn ik" onClick={() => git(`sonuc/${etkinlikId}`)}>Sonuçlara dön</button>
      </div>
    )
  }

  // ------------------------------------------------ oyun başlamadıysa: teklif ya da neden yok
  if (!d.basladi) {
    if (d.durum !== 'acik') {
      const neden =
        d.durum === 'oylar_eksik' ? 'Oyun, oylayabildiğin bütün karelere puan verince açılıyor.'
          : d.durum === 'oylama_kapali' ? 'Oyun oylama sürerken oynanıyor.'
            : 'Bu etkinlikte tahmin oyunu yok.'
      return (
        <div className="sc" data-asama="oylama">
          <Kunye sol="Oylama" geri="oyla" sag="Tahmin" />
          <h2 className="t orta">Tahmin<br />oyunu</h2>
          <p className="lede">{neden}</p>
          {d.durum === 'oylar_eksik' && <button className="btn" onClick={() => git('oyla')}>Oylamaya dön</button>}
        </div>
      )
    }
    return (
      <div className="sc" data-asama="oylama">
        <Kunye sol="Oylama" geri="oyla" sag="Tahmin" />
        <h2 className="t orta">Oyların<br />tamam</h2>
        <p className="lede">Sonuçlar {kalanYaz(e.oylama_biter)} sonra açılıyor. O zamana kadar isteğe bağlı bir oyun var.</p>
        <div className="tahmin-teklif">
          <span className="lab">Kim çekti · isteğe bağlı</span>
          <p>Birkaç kare seçiliyor. Her karede adaylar arasından kimin çektiğini tahmin ediyorsun. Skorun yalnız sana görünür.</p>
        </div>
        <div className="kutu">
          <div className="bas"><Ikon ad="kilit" /><span>Başlarsan puanların kilitlenir</span></div>
          <p>Tahmin etmek “bu kareyi kim çekti” diye düşünmeni istiyor. Puanların açık kalırsa o düşünce oylamana sızar. Bu yüzden oyun başladığı anda bu etkinlikte verdiğin puanlar değiştirilemez.</p>
        </div>
        <button className="btn" disabled={gidiyor} onClick={baslat}>Oyunu başlat</button>
        <button className="btn ik" onClick={() => git('oyla')}>Puanlarımı gözden geçir</button>
        <Hata metin={hata} />
      </div>
    )
  }

  // ------------------------------------------------ oyun sürüyor
  const siradaki = sorular.findIndex(x => x.cevap == null && !x.gecti)
  if (siradaki === -1) {
    const isim = sorular.filter(x => x.cevap != null).length
    const gecilen = sorular.filter(x => x.gecti).length
    return (
      <div className="sc" data-asama="oylama">
        <Kunye sol="Oylama" geri="oyla" sag="Tahmin" />
        <h2 className="t orta">Tahminlerin<br />gönderildi</h2>
        <p className="lede">
          {isim} kareye isim verdin{gecilen ? `, ${gecilen} kareyi geçtin` : ''}. Doğru cevaplar sonuçlarla birlikte açılıyor.
        </p>
        <div className="kutu">
          <div className="bas"><Ikon ad="kilit" /><span>Puanların kilitli</span></div>
          <p>Bu etkinlikte verdiğin puanlar artık değiştirilemiyor. Sonuçlar açılınca kaç bildiğini burada göreceksin.</p>
        </div>
        <button className="btn ik" onClick={() => git('etkinlikler')}>Etkinliklere dön</button>
      </div>
    )
  }

  const s = sorular[siradaki]
  const son = siradaki === sorular.length - 1
  const secimAd = s.adaylar.find(x => x.uye === secim)?.ad ?? null
  return (
    <div className="sc tahmin" data-asama="oylama">
      <Kunye sol="Oylama" geri="oyla" sag="Tahmin" />
      <div className="tahmin-ilerleme" aria-hidden="true">
        {sorular.map((x, i) => <i key={x.sira} className={i < siradaki ? 'dolu' : i === siradaki ? 'su' : ''} />)}
      </div>
      <div className="tahmin-bas">
        <b>Bu kareyi kim çekti</b>
        <span>{iki(siradaki + 1)} / {iki(sorular.length)}</span>
      </div>
      {/* Kırpma yok: tanımayı sağlayacak ipucu kırpılan yerde olabilir (spec 4. bölüm, karar 43) */}
      <div className="tahmin-foto">
        {s.url
          ? <img src={s.url} width={s.genislik} height={s.yukseklik} alt={`${s.tema_ad} teması, ${siradaki + 1}. kare`} draggable={false} />
          : <div className="bos" />}
      </div>
      <div className="adaylar" role="radiogroup" aria-label="Kim çekti">
        {s.adaylar.map(x => (
          <button key={x.uye} className={`aday ${secim === x.uye ? 'on' : ''}`} role="radio" aria-checked={secim === x.uye}
            onClick={() => setSecim(x.uye)}>
            {x.ad}
          </button>
        ))}
      </div>
      <button className="link" disabled={gidiyor} onClick={() => cevapla(s, true)}>Bilmiyorum, geç</button>
      <Hata metin={hata} />
      <div className="tahmin-alt">
        <span className="secim"><span className="lab">Seçimin</span><b>{secimAd ?? '—'}</b></span>
        <button className="btn kucuk" disabled={!secim || gidiyor} onClick={() => cevapla(s, false)}>
          {son ? 'Gönder' : 'Sıradaki'}
        </button>
      </div>
    </div>
  )
}

/** Fotoğraf detayında tek satır (karar 76, 106): sonuçtan sonra, herkese, alt sınırı geçtiyse. */
export function TaninmaSatiri({ kare, benim }: { kare: string; benim: boolean }) {
  const [t, setT] = useState<{ bilen: number; toplam: number } | null>(null)
  useEffect(() => {
    sb.rpc('taninma', { p_kare: kare }).then(({ data }) => setT(((data ?? []) as { bilen: number; toplam: number }[])[0] ?? null))
  }, [kare])
  if (!t) return null
  return (
    <div className="kunye taninma">
      <div><b>Tanınma</b><span>{t.bilen} / {t.toplam} kişi {benim ? 'seni tanıdı' : 'tanıdı'}</span></div>
    </div>
  )
}

/** Sonuç ekranında: oyunu oynadıysan skorun ve kareler kimindi sayfasına geçiş. */
export function TahminBaglantisi({ etkinlikId }: { etkinlikId: string }) {
  const [skor, setSkor] = useState<{ dogru: number; toplam: number } | null>(null)
  useEffect(() => {
    sb.rpc('tahmin_sonucum', { p_etkinlik: etkinlikId }).then(({ data }) => {
      const l = ((data ?? []) as SonucSatir[]).filter(x => x.sayildi)
      setSkor(l.length ? { dogru: l.filter(x => x.dogru).length, toplam: l.length } : null)
    })
  }, [etkinlikId])
  if (!skor) return null
  return (
    <button className="tahmin-kart" onClick={() => git(`tahmin/${etkinlikId}`)}>
      <span className="lab">Tahmin oyunu · yalnız sana</span>
      <b>{skor.dogru}/{skor.toplam} doğru bildin</b>
      <span className="git">Kimindi<Ikon ad="sag" /></span>
    </button>
  )
}
