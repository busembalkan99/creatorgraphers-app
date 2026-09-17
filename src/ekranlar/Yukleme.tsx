import { useEffect, useRef, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import type { Etkinlik, Kare, Tema, Uye } from '../lib/tipler'
import { asama, gunYaz, kalanYaz, saatYaz } from '../lib/zaman'
import { bilgiOku, DosyaHatasi, kucult, tarihKontrol } from '../lib/kare'
import { Ikon } from '../bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'

/**
 * Kare yükleme, kontakt baskı (kararlar 3, 29, 41, 92, 93, 94).
 * Prototip: prototype/creatorgraphers/2026-09-17_v22-kare-yukleme.html
 */

interface Ret {
  neden: 'yok' | 'gun'
  cekimGunu: string | null
  onizleme: string
}

interface TemaDurumu {
  kare: (Kare & { url: string | null }) | null
  yukleniyor: boolean
  ret: Ret | null
  onay: boolean
  hata: string | null
}

const bosDurum = (): TemaDurumu => ({ kare: null, yukleniyor: false, ret: null, onay: false, hata: null })

export function Yukleme({ uye, uyeDegisti }: { uye: Uye; uyeDegisti: (u: Uye) => void }) {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [temalar, setTemalar] = useState<Tema[]>([])
  const [D, setD] = useState<Record<string, TemaDurumu>>({})
  const [sec, setSec] = useState(0)
  const [hata, setHata] = useState<string | null>(null)
  const dosyaGir = useRef<HTMLInputElement>(null)

  const guncelle = (id: string, p: Partial<TemaDurumu>) =>
    setD(d => ({ ...d, [id]: { ...(d[id] ?? bosDurum()), ...p } }))

  useEffect(() => {
    ;(async () => {
      const { data: ev, error } = await sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false })
      if (error) throw error
      const acik = acikEtkinlik((ev ?? []) as Etkinlik[]) ?? null
      if (!acik) return setE(null)
      const { data: tm, error: e2 } = await sb.from('temalar').select('*').eq('etkinlik', acik.id).order('sira')
      if (e2) throw e2
      const temaList = (tm ?? []) as Tema[]
      setTemalar(temaList)
      const { data: kr, error: e3 } = await sb
        .from('kareler')
        .select('id, tema, dosya, genislik, yukseklik, cekim_gunu')
        .eq('sahip', uye.id)
        .in('tema', temaList.map(t => t.id))
      if (e3) throw e3
      const kareler = (kr ?? []) as Kare[]
      const imzalar = kareler.length
        ? (await sb.storage.from('kareler').createSignedUrls(kareler.map(k => k.dosya), 3600)).data ?? []
        : []
      const yeni: Record<string, TemaDurumu> = {}
      for (const t of temaList) yeni[t.id] = bosDurum()
      kareler.forEach((k, i) => {
        yeni[k.tema] = { ...bosDurum(), kare: { ...k, url: imzalar[i]?.signedUrl ?? null } }
      })
      setD(yeni)
      setE(acik)
      // İlk boş temayı seçili aç
      const ilkBos = temaList.findIndex(t => !yeni[t.id].kare)
      setSec(ilkBos >= 0 ? ilkBos : 0)
    })().catch(x => setHata(hataMetni(x)))
  }, [uye.id])

  if (hata) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" /><Hata metin={hata} /></div>
  if (e === undefined) return <Yukleniyor />
  if (e === null || temalar.length === 0) {
    return (
      <div className="sc">
        <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" />
        <h2 className="t orta">Açık<br />etkinlik yok</h2>
        <p className="lede">Yönetici yeni etkinliği kurunca kareni buradan yüklersin.</p>
      </div>
    )
  }

  const a = asama(e)
  const acik = a === 'yukleme'
  const t = temalar[Math.min(sec, temalar.length - 1)]
  const d = D[t.id] ?? bosDurum()
  const tamam = temalar.filter(x => D[x.id]?.kare).length

  async function yukle(dosya: File) {
    if (!e) return
    const tema = t
    const onceki = D[tema.id]?.kare ?? null
    guncelle(tema.id, { yukleniyor: true, ret: null, onay: false, hata: null })
    try {
      const bilgi = await bilgiOku(dosya)
      const k = tarihKontrol(tema.bulusmada, e.bulusma_gunu, bilgi.cekim_gunu)
      if (!k.ok) {
        // Değiştirme reddedilirse önceki kare yerinde kalır (karar 93)
        return guncelle(tema.id, {
          yukleniyor: false,
          ret: { neden: k.neden, cekimGunu: bilgi.cekim_gunu, onizleme: URL.createObjectURL(dosya) },
        })
      }
      const hazir = await kucult(dosya)
      const yol = `${e.id}/${tema.id}/${crypto.randomUUID()}.jpg`
      const yuk = await sb.storage.from('kareler').upload(yol, hazir.blob, { contentType: 'image/jpeg', upsert: false })
      if (yuk.error) throw yuk.error
      const satir = { tema: tema.id, sahip: uye.id, dosya: yol, genislik: hazir.genislik, yukseklik: hazir.yukseklik, ...bilgi }
      const kayit = onceki
        ? await sb.from('kareler').update(satir).eq('id', onceki.id).select('id, tema, dosya, genislik, yukseklik, cekim_gunu').single()
        : await sb.from('kareler').insert(satir).select('id, tema, dosya, genislik, yukseklik, cekim_gunu').single()
      if (kayit.error) {
        await sb.storage.from('kareler').remove([yol])
        throw kayit.error
      }
      if (onceki) await sb.storage.from('kareler').remove([onceki.dosya])
      guncelle(tema.id, {
        yukleniyor: false,
        kare: { ...(kayit.data as Kare), url: URL.createObjectURL(hazir.blob) },
      })
    } catch (x) {
      const m = x instanceof DosyaHatasi ? x.message : hataMetni(x)
      guncelle(tema.id, { yukleniyor: false, hata: m })
    }
  }

  async function kaldir() {
    const k = d.kare
    if (!k) return
    guncelle(t.id, { yukleniyor: true, onay: false })
    const { error } = await sb.from('kareler').delete().eq('id', k.id)
    if (error) return guncelle(t.id, { yukleniyor: false, hata: hataMetni(error) })
    await sb.storage.from('kareler').remove([k.dosya])
    guncelle(t.id, { yukleniyor: false, kare: null })
  }

  async function afis() {
    const yeni = !uye.afis_izni
    uyeDegisti({ ...uye, afis_izni: yeni })
    const { error } = await sb.from('uyeler').update({ afis_izni: yeni }).eq('id', uye.id)
    if (error) {
      uyeDegisti({ ...uye, afis_izni: !yeni })
      setHata(hataMetni(error))
    }
  }

  const sec_ = () => {
    if (acik && dosyaGir.current) {
      dosyaGir.current.value = ''
      dosyaGir.current.click()
    }
  }

  const kal = acik ? (
    <><b>{kalanYaz(e.yukleme_biter)}</b> kaldı · {tamam} / {temalar.length} tema tamam</>
  ) : a === 'baslamadi' ? (
    <>Yükleme açılışı: <b>{saatYaz(e.yukleme_baslar)}</b></>
  ) : (
    <>Yükleme kapandı · <b>oylama açık</b></>
  )

  const sart = t.bulusmada ? `Buluşmada çekilir · ${gunYaz(e.bulusma_gunu)}` : 'Serbest, istediğin gün çekebilirsin'

  let govde
  if (d.yukleniyor) {
    govde = (
      <div className="yuk" role="status">
        <b>Yükleniyor</b>
        <div className="bar"><i /></div>
        <span>{t.bulusmada ? 'Çekim tarihi kontrol ediliyor' : 'Kare yükleniyor'}</span>
      </div>
    )
  } else if (d.onay && d.kare) {
    govde = (
      <div className="ret">
        <div className="ust">
          {d.kare.url && <img src={d.kare.url} alt="" />}
          <div className="baslik">
            <span className="bt">Kareni kaldırmak istiyor musun?
              <span className="tar">Yükleme kapanana kadar yenisini koyabilirsin</span></span>
          </div>
        </div>
        <p>Kaldırırsan bu temaya katılmamış olursun. Bu temayı oylamak zorunda kalmazsın, istersen yine oylayabilirsin.</p>
        <button className="btn" onClick={kaldir}><Ikon ad="cop" />Kaldır</button>
        <button className="btn ik" onClick={() => guncelle(t.id, { onay: false })}>Vazgeç</button>
      </div>
    )
  } else if (d.ret) {
    const r = d.ret
    const yilFarkli = r.cekimGunu && r.cekimGunu.slice(0, 4) !== e.bulusma_gunu.slice(0, 4)
    govde = (
      <div className="ret" role="alert">
        <div className="ust">
          <img className="soluk" src={r.onizleme} alt="" onError={x => (x.currentTarget.style.visibility = 'hidden')} />
          <div className="baslik">
            <Ikon ad={r.neden === 'gun' ? 'takvim' : 'info'} />
            <span className="bt">
              {r.neden === 'gun' ? 'Bu kare buluşma günü çekilmemiş' : 'Bu dosyada çekim tarihi yok'}
              <span className="tar">Çekildiği gün: {r.cekimGunu ? gunYaz(r.cekimGunu, false) : 'bilinmiyor'}</span>
            </span>
          </div>
        </div>
        <p>
          {r.neden === 'gun'
            ? `${t.ad} temasını ${gunYaz(e.bulusma_gunu)} günkü buluşmada çekiyoruz.${yilFarkli ? ' Makinenin saati ayarlı değilse tarih yanlış çıkar.' : ''}`
            : "WhatsApp'tan gelen ya da bilgileri silinerek dışa aktarılan dosyalarda tarih kalmıyor. Makineden aktardığın orijinal dosyayı seç."}
        </p>
        {d.kare && <p>Önceki karen yerinde duruyor.</p>}
        {acik && <button className="btn" onClick={sec_}><Ikon ad="yenile" />Başka kare seç</button>}
        {d.kare && <button className="btn ik" onClick={() => guncelle(t.id, { ret: null })}>Öncekiyle devam et</button>}
      </div>
    )
  } else if (d.kare) {
    govde = (
      <>
        <div className="dolu">
          {d.kare.url ? <img src={d.kare.url} alt={`${t.ad} karen`} /> : <div className="yer" />}
          <div className="tar">Çekildiği gün: {d.kare.cekim_gunu ? gunYaz(d.kare.cekim_gunu, false) : 'bilinmiyor'}</div>
        </div>
        {acik ? (
          <div className="akt">
            <button className="btn ik" onClick={sec_}><Ikon ad="yenile" />Değiştir</button>
            <button className="btn ik" onClick={() => guncelle(t.id, { onay: true, hata: null })}><Ikon ad="cop" />Kaldır</button>
          </div>
        ) : (
          <div className="kilit"><Ikon ad="kilit" /><span>Yükleme kapandı, kareler artık değişmiyor.</span></div>
        )}
      </>
    )
  } else if (acik) {
    govde = (
      <button className="bos" onClick={sec_}>
        <Ikon ad="arti" /><b>Kare seç</b><span>Makineden aktardığın orijinal dosya</span>
      </button>
    )
  } else if (a === 'baslamadi') {
    govde = <div className="kilit"><Ikon ad="kilit" /><span>Yükleme henüz açılmadı. Açılış: {saatYaz(e.yukleme_baslar)}.</span></div>
  } else {
    govde = <div className="kilit"><Ikon ad="kilit" /><span>Yükleme kapandı. Bu temaya kare vermedin; bu temayı oylamak zorunda değilsin.</span></div>
  }

  return (
    <div className="sc" data-asama="yukleme">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" />
      <h2 className="t orta">Kareni<br />yükle</h2>
      <div className="kal">{kal}</div>

      <div className={`kontakt t${temalar.length}`}>
        {temalar.map((x, i) => {
          const dx = D[x.id] ?? bosDurum()
          const etiket = dx.yukleniyor ? 'yükleniyor' : dx.kare ? 'yüklendi' : dx.ret ? 'yüklenmedi' : 'boş'
          return (
            <button key={x.id} className={`k ${i === sec ? 'secili' : ''}`} onClick={() => setSec(i)} aria-pressed={i === sec}>
              <div className={`kk ${dx.kare && !dx.yukleniyor ? '' : 'b'}`}>
                {dx.yukleniyor ? (
                  <div className="mini"><div className="bar"><i /></div></div>
                ) : dx.kare?.url ? (
                  <img src={dx.kare.url} alt="" />
                ) : (
                  <Ikon ad="arti" />
                )}
              </div>
              <div className="ad">{x.ad}</div>
              <div className="d">{etiket}</div>
            </button>
          )
        })}
      </div>

      <div className="sec yuk-sec">{t.ad}</div>
      <div className="sart">{sart}</div>
      {govde}
      <Hata metin={d.hata} />

      <button className="izin" onClick={afis} aria-pressed={uye.afis_izni}>
        <span className={`box ${uye.afis_izni ? 'on' : ''}`} />
        <span><b>Kulüp afişi</b><span>Kazanırsam karem kulüp afişinde kullanılabilir.</span></span>
      </button>

      <input
        ref={dosyaGir}
        type="file"
        accept="image/jpeg,image/*"
        hidden
        onChange={x => {
          const f = x.target.files?.[0]
          if (f) yukle(f)
        }}
      />
    </div>
  )
}
