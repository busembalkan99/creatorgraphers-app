import { useEffect, useRef, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Kare, Tema, Uye } from '../lib/tipler'
import { asama, gunYaz, kalanYaz, saatYaz } from '../lib/zaman'
import { ACILAMADI, bilgiOku, DosyaHatasi, kucult, OkuyucuHatasi, tarihKontrol } from '../lib/kare'
import { Ikon } from '../bilesenler/Ikon'
import { geriGit } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'
import { kareAdresleri, onizlemeYolu } from '../lib/imza'
import { kareSil, kareYukle } from '../lib/depo'
import { MASAUSTU } from '../lib/masaustu'

/**
 * Kare yükleme, kontakt baskı (kararlar 3, 29, 41, 92, 93, 94).
 * Prototip: prototype/creatorgraphers/2026-09-17_v22-kare-yukleme.html
 */

// Okuyucu inmediği için sayfa bu oturumda bir kez yenilendi mi
const YENILENDI = 'okuyucu-yenilendi'

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

const KILIT_METNI = 'Yoklamada adın yok, bu etkinliğe kare yükleyemezsin. Yanlışlık varsa yöneticiye yaz.'
const dosyaSurukleniyor = (ev: { dataTransfer: DataTransfer | null }) => !!ev.dataTransfer?.types.includes('Files')

export function Yukleme({ uye, uyeDegisti }: { uye: Uye; uyeDegisti: (u: Uye) => void }) {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [temalar, setTemalar] = useState<Tema[]>([])
  const [D, setD] = useState<Record<string, TemaDurumu>>({})
  const [sec, setSec] = useState(0)
  const [hata, setHata] = useState<string | null>(null)
  // Karar 103: yoklama alındıysa ve adın yoksa bu etkinliğe kare yüklenmiyor
  const [gelmedi, setGelmedi] = useState(false)
  // Yarışmadan çıkarılan kendi karelerin: kare kimliği → neden
  const [cikan, setCikan] = useState<Record<string, string>>({})
  const dosyaGir = useRef<HTMLInputElement>(null)
  // Dosya seçicinin hangi temaya yükleyeceği (masaüstünde her temanın kendi alanı var)
  const hedef = useRef<Tema | null>(null)
  // Masaüstü sürükleme: üstündeki temanın kimliği; '' pencerede ama alanda değil; null sürükleme yok
  const [suruk, setSuruk] = useState<string | null>(null)
  // Masaüstü listesi yalnız masaüstünde çiziliyor: telefonun DOM'u (ve seçicileri) değişmesin
  const [masaustu, setMasaustu] = useState(() => matchMedia(MASAUSTU).matches)

  const guncelle = (id: string, p: Partial<TemaDurumu>) =>
    setD(d => ({ ...d, [id]: { ...(d[id] ?? bosDurum()), ...p } }))

  useEffect(() => {
    ;(async () => {
      const { data: ev, error } = await sor(sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }))
      if (error) throw error
      const acik = acikEtkinlik((ev ?? []) as Etkinlik[]) ?? null
      if (!acik) return setE(null)
      const { data: tm, error: e2 } = await sor(sb.from('temalar').select('*').eq('etkinlik', acik.id).order('sira'))
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
      const [yk, dk] = await sor(Promise.all([
        sb.rpc('yoklamam', { p_etkinlik: acik.id }),
        kareler.length ? sb.from('diskalifiye').select('kare, neden').in('kare', kareler.map(k => k.id)) : Promise.resolve({ data: [], error: null }),
      ]))
      if (yk.error) throw yk.error
      if (dk.error) throw dk.error
      const ben = (yk.data ?? [])[0] as { alindi: boolean; geldim: boolean } | undefined
      const gelmedi_ = !!ben?.alindi && !ben.geldim
      const cikan_ = Object.fromEntries(((dk.data ?? []) as { kare: string; neden: string }[]).map(x => [x.kare, x.neden]))
      setGelmedi(gelmedi_)
      setCikan(cikan_)
      const imzalar = kareler.length
        ? await kareAdresleri(kareler.map(k => k.dosya))
        : []
      const yeni: Record<string, TemaDurumu> = {}
      for (const t of temaList) yeni[t.id] = bosDurum()
      kareler.forEach((k, i) => {
        yeni[k.tema] = { ...bosDurum(), kare: { ...k, url: imzalar[i]?.url ?? null } }
      })
      setD(yeni)
      setE(acik)
      // Önce söylenmesi gereken: yarışmadan çıkarılan karen. Yükleyemiyorsan boş tema
      // açmanın anlamı yok. Yoksa ilk boş tema.
      const cikanTema = temaList.findIndex(t => { const k = yeni[t.id].kare; return !!k && k.id in cikan_ })
      const ilkBos = gelmedi_ ? -1 : temaList.findIndex(t => !yeni[t.id].kare)
      setSec(cikanTema >= 0 ? cikanTema : ilkBos >= 0 ? ilkBos : 0)
    })().catch(x => setHata(hataMetni(x)))
  }, [uye.id])

  useEffect(() => {
    const mq = matchMedia(MASAUSTU)
    const degisti = () => setMasaustu(mq.matches)
    mq.addEventListener('change', degisti)
    return () => mq.removeEventListener('change', degisti)
  }, [])

  useEffect(() => {
    const mq = matchMedia(MASAUSTU)
    // dragenter yeni öğede eskisinin dragleave'inden önce geliyor: pencereden çıkışı sayaç söylüyor
    let derinlik = 0
    const gir = (ev: DragEvent) => {
      if (!mq.matches) return
      derinlik++
      if (!dosyaSurukleniyor(ev)) return
      // Bırakılabilir alanın kendi dragenter'ı kimliğini az önce yazdı; başka her yerde işaret kalkıyor
      const alan = ev.target instanceof Element ? ev.target.closest('.m-alan')?.closest<HTMLElement>('.m-yuk-tema') : null
      const tema = alan?.dataset.tema
      setSuruk(s => (s !== null && s === tema ? s : ''))
    }
    const cik = () => {
      if (!mq.matches) return
      derinlik = Math.max(0, derinlik - 1)
      if (derinlik === 0) setSuruk(null)
    }
    // Alan dışına bırakılan dosya tarayıcıyı sayfadan çıkarmasın
    const engel = (ev: DragEvent) => { if (mq.matches && dosyaSurukleniyor(ev)) ev.preventDefault() }
    const birak = (ev: DragEvent) => {
      if (!mq.matches) return
      if (dosyaSurukleniyor(ev)) ev.preventDefault()
      derinlik = 0
      setSuruk(null)
    }
    addEventListener('dragenter', gir); addEventListener('dragleave', cik)
    addEventListener('dragover', engel); addEventListener('drop', birak)
    return () => {
      removeEventListener('dragenter', gir); removeEventListener('dragleave', cik)
      removeEventListener('dragover', engel); removeEventListener('drop', birak)
    }
  }, [])

  if (hata) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" /><Hata metin={hata} /></div>
  if (e === undefined) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" /><Yukleniyor /></div>
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
  const neden = d.kare ? cikan[d.kare.id] : undefined
  // Yükledikten sonra çıkmaz sokak kalmasın: sıradaki boş tema ya da etkinliklere dönüş
  const sonraki = temalar.find(x => x.id !== t.id && !D[x.id]?.kare)

  async function yukle(dosya: File, tema: Tema = t) {
    if (!e) return
    const onceki = D[tema.id]?.kare ?? null
    guncelle(tema.id, { yukleniyor: true, ret: null, onay: false, hata: null })
    try {
      const bilgi = await bilgiOku(dosya)
      sessionStorage.removeItem(YENILENDI)
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
      await kareYukle(yol, hazir.blob)   // R2'ye (karar 127)
      // Önizleme kopyası (karar 123): yüklenemezse ekran tam boya düşüyor, yükleme durmuyor
      if (hazir.kucuk) await kareYukle(onizlemeYolu(yol), hazir.kucuk).catch(() => {})
      const satir = { tema: tema.id, sahip: uye.id, dosya: yol, genislik: hazir.genislik, yukseklik: hazir.yukseklik, ...bilgi }
      const kayit = onceki
        ? await sb.from('kareler').update(satir).eq('id', onceki.id).select('id, tema, dosya, genislik, yukseklik, cekim_gunu').single()
        : await sb.from('kareler').insert(satir).select('id, tema, dosya, genislik, yukseklik, cekim_gunu').single()
      if (kayit.error) {
        await kareSil([yol, onizlemeYolu(yol)])
        throw kayit.error
      }
      if (onceki) await kareSil([onceki.dosya, onizlemeYolu(onceki.dosya)])
      guncelle(tema.id, {
        yukleniyor: false,
        kare: { ...(kayit.data as Kare), url: URL.createObjectURL(hazir.blob) },
      })
    } catch (x) {
      // Okuyucu inmediyse ve bağlantı varsa yayında yeni sürüm var demek: eski dosya silinmiş.
      // Sayfa yenilenir, kişi aynı ekrana yeni sürümle döner ve kareyi yeniden seçer.
      // Oturumda bir kez: yenilemek çare olmadıysa (dosya engelli, ağ yarım) her seçimde yenilenmesin.
      if (x instanceof OkuyucuHatasi && navigator.onLine && !sessionStorage.getItem(YENILENDI)) {
        sessionStorage.setItem(YENILENDI, '1')
        return window.location.reload()
      }
      const m = x instanceof DosyaHatasi ? x.message
        : x instanceof OkuyucuHatasi ? 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.'
        : hataMetni(x)
      guncelle(tema.id, { yukleniyor: false, hata: m })
    }
  }

  async function kaldir(tema: Tema) {
    const k = D[tema.id]?.kare
    if (!k) return
    guncelle(tema.id, { yukleniyor: true, onay: false })
    const { error } = await sb.from('kareler').delete().eq('id', k.id)
    if (error) return guncelle(tema.id, { yukleniyor: false, hata: hataMetni(error) })
    await kareSil([k.dosya, onizlemeYolu(k.dosya)])
    guncelle(tema.id, { yukleniyor: false, kare: null })
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

  const secFor = (tema: Tema) => {
    hedef.current = tema
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

  return (
    <div className="sc" data-asama="yukleme">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Yükleme" />
      <h2 className="t orta">Kareni<br />yükle</h2>
      <div className="kal">{kal}</div>

      <div className={`kontakt t${temalar.length}`}>
        {temalar.map((x, i) => {
          const dx = D[x.id] ?? bosDurum()
          const etiket = dx.yukleniyor ? 'yükleniyor' : dx.kare ? (dx.kare.id in cikan ? 'çıkarıldı' : 'yüklendi') : dx.ret ? 'yüklenmedi' : 'boş'
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

      {/* Telefonun seçili-tema akışı; masaüstünde her tema kendi sütununda (.m-temalar) */}
      {!masaustu && <div className="m-govde-tel">
        <h2 className="kart-bas">{t.ad}</h2>
        <div className="sart">{sartYaz(t, e)}</div>
        <Govde tema={t} d={d} e={e} acik={acik} gelmedi={gelmedi} neden={neden}
          sec={() => secFor(t)} kaldir={() => kaldir(t)} guncelle={y => guncelle(t.id, y)} />
        <Hata metin={d.hata} />
        {acik && !gelmedi && d.kare && !d.yukleniyor && !d.ret && !d.onay && (
          sonraki ? (
            <button className="btn" onClick={() => setSec(temalar.indexOf(sonraki))}>{sonraki.ad} temasına geç</button>
          ) : (
            <div className="kart kutu">
              <div className="bas"><span>{temalar.length > 1 ? 'Kareler yüklendi' : 'Karen yüklendi'}</span></div>
              <p>Yükleme kapanana kadar değiştirebilirsin.</p>
              <button className="btn" onClick={() => geriGit('etkinlikler')}>Etkinliklere dön</button>
            </div>
          )
        )}
      </div>}

      {masaustu && <div className={`m-temalar t${temalar.length}`}>
        {temalar.map(x => {
          const dx = D[x.id] ?? bosDurum()
          const etiket = dx.yukleniyor ? 'Yükleniyor' : dx.kare ? (dx.kare.id in cikan ? 'Çıkarıldı' : 'Yüklendi') : dx.ret ? 'Yüklenmedi' : 'Boş'
          // Yüklenirken ikinci dosya bırakılmasın; çıkarılan karenin yerine yenisi konmuyor (telefonda da Değiştir yok)
          const alanVar = acik && !gelmedi && !dx.yukleniyor && !(dx.kare && dx.kare.id in cikan)
          return (
            <section key={x.id} className="m-yuk-tema" data-tema={x.id}>
              <div className="m-tema-bas"><h3 className="m-tema-ad">{x.ad}</h3><span className="m-durum">{etiket}</span></div>
              <div className="sart">{sartYaz(x, e)}</div>
              <div className={`m-alan ${suruk === x.id ? 'uzerinde' : ''}`}
                // Alandaki kendi karesi sürüklenmesin: Chrome resmi dosya olarak taşıyor, başka temaya yüklenirdi
                onDragStart={ev => ev.preventDefault()}
                onDragEnter={ev => { if (!alanVar || !dosyaSurukleniyor(ev)) return; ev.preventDefault(); setSuruk(x.id) }}
                onDragOver={ev => { if (!alanVar || !dosyaSurukleniyor(ev)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy' }}
                onDrop={ev => {
                  ev.preventDefault()
                  if (!alanVar) return
                  const f = [...ev.dataTransfer.files]
                  if (f.length !== 1) return guncelle(x.id, { hata: 'Birden çok kare bıraktın. Bu temaya tek kare bırak.' })
                  // Seçici yalnız resim gösteriyor (accept); bırakılan dosyada bu süzgeç yok
                  if (f[0].type && !f[0].type.startsWith('image/')) return guncelle(x.id, { hata: ACILAMADI })
                  yukle(f[0], x)
                }}>
                <Govde tema={x} d={dx} e={e} acik={acik} gelmedi={gelmedi} neden={dx.kare ? cikan[dx.kare.id] : undefined}
                  sec={() => secFor(x)} kaldir={() => kaldir(x)} guncelle={y => guncelle(x.id, y)} />
                {alanVar && suruk !== null && (
                  <div className="m-birak" aria-hidden="true"><Ikon ad="arti" /><b>Buraya bırak</b><span>{x.ad} temasına yüklenecek</span></div>
                )}
              </div>
              <Hata metin={dx.hata} />
            </section>
          )
        })}
        {acik && !gelmedi && <p className="m-ipucu-yukle">Kareyi temanın alanına sürükle.</p>}
      </div>}

      <div className="satir-kartlari afis">
        <button className="izin" onClick={afis} aria-pressed={uye.afis_izni}>
          <span className={`box ${uye.afis_izni ? 'on' : ''}`} />
          <span><b>Kulüp afişi</b><span>Kazanırsam karem kulüp afişinde kullanılabilir.</span></span>
        </button>
      </div>

      <input
        ref={dosyaGir}
        type="file"
        accept="image/jpeg,image/*"
        hidden
        onChange={x => {
          const f = x.target.files?.[0]
          if (f) yukle(f, hedef.current ?? t)
        }}
      />
    </div>
  )
}

const sartYaz = (tema: Tema, e: Etkinlik) =>
  tema.bulusmada ? `Buluşmada çekilir · ${gunYaz(e.bulusma_gunu)}` : 'Serbest, istediğin gün çekebilirsin'

/** Bir temanın durumu: telefonda seçili tema için, masaüstünde her temanın alanında çiziliyor. */
function Govde({ tema, d, e, acik, gelmedi, neden, sec, kaldir, guncelle }: {
  tema: Tema; d: TemaDurumu; e: Etkinlik; acik: boolean; gelmedi: boolean; neden: string | undefined
  sec: () => void; kaldir: () => void; guncelle: (y: Partial<TemaDurumu>) => void
}) {
  const a = asama(e)
  let govde
  if (d.yukleniyor) {
    govde = (
      <div className="yuk" role="status">
        <b>Yükleniyor</b>
        <div className="bar"><i /></div>
        <span>{tema.bulusmada ? 'Çekim tarihi kontrol ediliyor' : 'Kare yükleniyor'}</span>
      </div>
    )
  } else if (d.onay && d.kare) {
    govde = (
      <div className="kart ret">
        <div className="ust">
          {d.kare.url && <img src={d.kare.url} alt="" />}
          <div className="baslik">
            <span className="bt">Kareni kaldırmak istiyor musun?
              <span className="tar">Yükleme kapanana kadar yenisini koyabilirsin</span></span>
          </div>
        </div>
        <p>Kaldırırsan bu temaya katılmamış olursun. Oylaman da gerekmez.</p>
        <button className="btn" onClick={kaldir}><Ikon ad="cop" />Kaldır</button>
        <button className="btn ik" onClick={() => guncelle({ onay: false })}>Vazgeç</button>
      </div>
    )
  } else if (d.ret) {
    const r = d.ret
    const yilFarkli = r.cekimGunu && r.cekimGunu.slice(0, 4) !== e.bulusma_gunu.slice(0, 4)
    govde = (
      <div className="kart ret" role="alert">
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
            ? `${tema.ad} ${gunYaz(e.bulusma_gunu)} buluşmasında çekiliyor.${yilFarkli ? ' Makinenin saati ayarlı değilse tarih yanlış çıkar.' : ''}`
            : "WhatsApp'tan gelen dosyalarda tarih kalmıyor. Makineden gelen dosyayı seç."}
        </p>
        {d.kare && <p>Önceki karen yerinde duruyor.</p>}
        {acik && <button className="btn" onClick={sec}><Ikon ad="yenile" />Başka kare seç</button>}
        {d.kare && <button className="btn ik" onClick={() => guncelle({ ret: null })}>Öncekiyle devam et</button>}
      </div>
    )
  } else if (d.kare && neden !== undefined) {
    govde = (
      <>
        <div className="dolu">
          <div className="m-pk">{d.kare.url ? <img src={d.kare.url} alt={`${tema.ad} karen`} /> : <div className="yer" />}</div>
        </div>
        <div className="cikarildi-not"><b>Yarışmadan çıkarıldı</b><span>{neden}</span></div>
      </>
    )
  } else if (d.kare && gelmedi) {
    govde = (
      <>
        <div className="dolu">
          <div className="m-pk">{d.kare.url ? <img src={d.kare.url} alt={`${tema.ad} karen`} /> : <div className="yer" />}</div>
        </div>
        <div className="kilit"><Ikon ad="kilit" /><span>{KILIT_METNI}</span></div>
      </>
    )
  } else if (d.kare) {
    govde = (
      <>
        <div className="dolu">
          <div className="m-pk">{d.kare.url ? <img src={d.kare.url} alt={`${tema.ad} karen`} /> : <div className="yer" />}</div>
          <div className="tar">Çekildiği gün: {d.kare.cekim_gunu ? gunYaz(d.kare.cekim_gunu, false) : 'bilinmiyor'}</div>
        </div>
        {acik ? (
          <div className="akt">
            <button className="btn ik" onClick={sec}><Ikon ad="yenile" />Değiştir</button>
            <button className="btn ik" onClick={() => guncelle({ onay: true, hata: null })}><Ikon ad="cop" />Kaldır</button>
          </div>
        ) : (
          <div className="kilit"><Ikon ad="kilit" /><span>Yükleme kapandı, kareler artık değişmiyor.</span></div>
        )}
      </>
    )
  } else if (gelmedi) {
    govde = <div className="kilit"><Ikon ad="kilit" /><span>{KILIT_METNI}</span></div>
  } else if (acik) {
    govde = (
      <button className="bos" onClick={sec}>
        <Ikon ad="arti" /><b>Kare seç</b><span>Makineden gelen dosya</span>
      </button>
    )
  } else if (a === 'baslamadi') {
    govde = <div className="kilit"><Ikon ad="kilit" /><span>Yükleme açılmadı. Açılış: {saatYaz(e.yukleme_baslar)}.</span></div>
  } else {
    govde = <div className="kilit"><Ikon ad="kilit" /><span>Bu temaya kare vermedin. Oylaman gerekmiyor.</span></div>
  }
  return govde
}
