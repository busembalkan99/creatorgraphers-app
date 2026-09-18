import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Uye } from '../lib/tipler'
import { asama, ayAdi, kalanYaz, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'

/**
 * Profil (kararlar 56, 57, 58, 69, 83).
 * Prototip: prototype/creatorgraphers/2026-09-12_v17-profil-siralama.html
 * Tek şablon, herkesin profili var. Ayarlar ve yönetim yalnız kendi profilinde.
 * Ortalama herkese görünmez: kendininkini sen görürsün, başkasınınkini sıralamada.
 */

interface Kunyem {
  uye: string; ad: string; benim: boolean; rol: string; katildi_at: string
  etkinlik_sayisi: number; kare_sayisi: number; seri: number
  tam_set: boolean; tema_sayisi: number; ortalama: number | null
}
interface ProfilKare {
  id: string; tema_ad: string; etkinlik: string; bulusma_gunu: string
  dosya: string; genislik: number; yukseklik: number
  ortalama: number | null; sira: number | null; sirali: boolean; benim: boolean
  url?: string | null
}
interface Tarif { tur: 'odak' | 'diyafram' | 'isik'; etiket: string | null; deger: string; adet: number; toplam: number }

const puanYaz = (n: number | null) => (n == null ? '' : n.toFixed(1).replace('.', ','))

async function profilVerisi(hedef: string | undefined) {
  const arg = hedef ? { p_uye: hedef } : {}
  const [p, k, t] = await sor(Promise.all([
    sb.rpc('profil', arg),
    sb.rpc('profil_kareleri', arg),
    sb.rpc('profil_tarifi', arg),
  ]))
  if (p.error) throw p.error
  if (k.error) throw k.error
  if (t.error) throw t.error
  const kareler = (k.data ?? []) as ProfilKare[]
  const imza = kareler.length
    ? (await sor(sb.storage.from('kareler').createSignedUrls(kareler.map(x => x.dosya), 3600))).data ?? []
    : []
  return {
    kunye: ((p.data ?? [])[0] ?? null) as Kunyem | null,
    kareler: kareler.map((x, i) => ({ ...x, url: imza[i]?.signedUrl ?? null })),
    tarif: (t.data ?? []) as Tarif[],
  }
}

export function Profil({ uye, uyeDegisti, hedef }:
  { uye: Uye; uyeDegisti: (u: Uye) => void; hedef?: string }) {
  const benim = !hedef || hedef === uye.id
  const [v, setV] = useState<Awaited<ReturnType<typeof profilVerisi>> | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    profilVerisi(hedef).then(setV).catch(x => setHata(hataMetni(x)))
  }, [hedef, uye.id])

  const baslik = benim
    ? <Kunye sol="Creatorgraphers" sag="Profil" />
    : <Kunye sol="Sıralama" geri="siralama" sag="Profil" />

  if (hata) return <div className="sc">{baslik}<Hata metin={hata} /></div>
  if (!v) return <div className="sc">{baslik}<Yukleniyor /></div>
  if (!v.kunye) return <div className="sc">{baslik}<h2 className="t orta">Bu kişi<br />kulüpte yok</h2></div>

  const k = v.kunye
  const odak = v.tarif.filter(x => x.tur === 'odak')
  const dagilim = odak.length > 1
  const diyafram = v.tarif.find(x => x.tur === 'diyafram')
  const isik = v.tarif.find(x => x.tur === 'isik')
  const bos = Number(k.kare_sayisi) === 0

  return (
    <div className="sc">
      {baslik}
      <h2 className="pname">{k.ad}</h2>
      <div className="since">{aydanBeri(k.katildi_at)}{k.rol !== 'uye' && ` · ${rolAdi(k.rol)}`}</div>

      <div className={`stats ${bos ? 'zero' : ''}`}>
        <div><b>{k.etkinlik_sayisi}</b><span>Etkinlik</span></div>
        <div><b>{k.kare_sayisi}</b><span>Kare</span></div>
        <div><b>{k.seri}</b><span>Seri</span></div>
      </div>
      {benim && k.ortalama != null && (
        <p className="veri">Ortalaman <b>{puanYaz(k.ortalama)}</b>. Yalnız sen görüyorsun.</p>
      )}

      <div className="sec">Katkı</div>
      {k.tam_set || Number(k.tema_sayisi) > 0 ? (
        <div className="badges">
          {k.tam_set && (
            <div className="badge">
              <b>Tam set</b>
              <span>Her etkinlikte bütün temalara kare {benim ? 'verdin' : 'verdi'}.</span>
            </div>
          )}
          {Number(k.tema_sayisi) > 0 && (
            <div className="badge">
              <b>{k.tema_sayisi} tema</b>
              <span>Bu kadar farklı temada kare {benim ? 'verdin' : 'verdi'}.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 0 }}>
          <b>Katkı</b>
          <span>İlk etkinlikten sonra.</span>
        </div>
      )}

      <div className="sec">{benim ? 'Nasıl çekiyorsun' : 'Nasıl çekiyor'}<span>Makine bilgisinden</span></div>
      {v.tarif.length === 0 ? (
        <div className="empty" style={{ marginTop: 0 }}>
          <b>Çekim tarifi</b>
          {/* Üç karesi varken "üç kareden sonra" demek yanlış: eksik olan kare değil,
              karelerdeki makine bilgisi. Telefonla düzenlenen dosyalarda siliniyor. */}
          <span>{Number(k.kare_sayisi) >= 3 ? 'Karelerinde makine bilgisi yok.' : 'Üç kareden sonra.'}</span>
        </div>
      ) : (
        <>
          {odak.map((o, i) => (
            <div className="habit" key={o.deger}>
              <span className="k">{i === 0 ? 'En çok' : ''}</span>
              <span className="v">{o.deger}</span>
              <span className="n">{dagilim ? `%${Math.round((o.adet / o.toplam) * 100)}` : `${o.adet} / ${o.toplam} kare`}</span>
            </div>
          ))}
          {diyafram && (
            <div className="habit">
              <span className="k">Diyafram</span>
              <span className="v">{diyafram.etiket}</span>
              <span className="n">{diyafram.deger}</span>
            </div>
          )}
          {isik && (
            <div className="habit">
              <span className="k">Işık</span>
              <span className="v">{isik.etiket}</span>
              <span className="n">{isik.deger}</span>
            </div>
          )}
        </>
      )}

      <div className="sec">{benim ? 'Karelerin' : 'Kareleri'}<span>{k.kare_sayisi} kare</span></div>
      {bos ? (
        <div className="empty" style={{ marginTop: 0 }}>
          <b>Henüz kare yok</b>
          <span>{benim ? 'İlk karen buraya gelecek.' : 'İlk karesi buraya gelecek.'}</span>
        </div>
      ) : (
        <>
          <div className="grid">
            {v.kareler.map(kr => (
              <figure key={kr.id} className={kr.sirali ? 'sirali' : ''} onClick={() => git(`sonuc/${kr.etkinlik}`)}>
                {kr.url && <img src={kr.url} alt={`${kr.tema_ad} · ${k.ad}`} />}
                <figcaption>
                  <span>{kr.tema_ad}</span>
                  {kr.sirali && <i />}
                  {kr.ortalama != null && <b>{puanYaz(kr.ortalama)}</b>}
                </figcaption>
              </figure>
            ))}
          </div>
          {!benim && v.kareler.some(x => !x.sirali) && (
            <p className="gridnot">Sıralamaya girmeyen karelerin puanı gizli.</p>
          )}
        </>
      )}

      {benim && <Ayarlar uye={uye} uyeDegisti={uyeDegisti} />}
    </div>
  )
}

/** Ayarlar ve yönetim yalnız kendi profilinde (karar 58, 83). */
function Ayarlar({ uye, uyeDegisti }: { uye: Uye; uyeDegisti: (u: Uye) => void }) {
  const [bekleyen, setBekleyen] = useState<number | null>(null)
  const [acik, setAcik] = useState<Etkinlik | null | undefined>(undefined)
  const [hata, setHata] = useState<string | null>(null)
  const yonetici = uye.rol !== 'uye'

  useEffect(() => {
    if (!yonetici) return
    ;(async () => {
      const [b, e] = await sor(Promise.all([
        sb.rpc('bekleyen_istekler'),
        sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }),
      ]))
      if (b.error) throw b.error
      if (e.error) throw e.error
      setBekleyen((b.data ?? []).length)
      setAcik(acikEtkinlik((e.data ?? []) as Etkinlik[]) ?? null)
    })().catch(x => setHata(hataMetni(x)))
  }, [yonetici])

  async function afis() {
    const yeni = !uye.afis_izni
    uyeDegisti({ ...uye, afis_izni: yeni })
    const { error } = await sb.from('uyeler').update({ afis_izni: yeni }).eq('id', uye.id)
    if (error) {
      uyeDegisti({ ...uye, afis_izni: !yeni })
      setHata(hataMetni(error))
    }
  }

  return (
    <>
      <div className="sec">Ayarlar<span>{uye.eposta}</span></div>
      <button className="izin" onClick={afis} aria-pressed={uye.afis_izni} style={{ marginTop: 0 }}>
        <span className={`box ${uye.afis_izni ? 'on' : ''}`} />
        <span><b>Kulüp afişi</b><span>Kazanırsam karem kulüp afişinde kullanılabilir.</span></span>
      </button>

      {yonetici && (
        <>
          <div className="sec">Yönetim</div>
          {bekleyen !== null && bekleyen > 0 && (
            <button className="satir" onClick={() => git('uyeler')}>
              <div className="tx"><b>{bekleyen} katılma isteği</b><span>Onaylaman ya da reddetmen bekleniyor</span></div>
              <div className="deg">Aç</div>
            </button>
          )}
          {acik === null && (
            <button className="satir" onClick={() => git('kur')}>
              <div className="tx"><b>Etkinliği kur</b><span>Açık etkinlik yok</span></div>
              <div className="deg">Kur</div>
            </button>
          )}
          {acik && (
            <button className="satir" onClick={() => git('asama')}>
              <div className="tx">
                <b>{ayAdi(acik.bulusma_gunu)} etkinliği</b>
                <span>{asamaCumlesi(acik)}</span>
              </div>
              <div className="deg">Aç</div>
            </button>
          )}
          <button className="satir" onClick={() => git('uyeler')}>
            <div className="tx"><b>Üyeler</b><span>{uye.rol === 'kurucu' ? 'İstekler, roller' : 'Katılma istekleri, üye listesi'}</span></div>
            <div className="deg">Aç</div>
          </button>
        </>
      )}

      <Hata metin={hata} />
      <div className="bosluk" />
      <button className="btn ik" onClick={() => sb.auth.signOut()}>Çıkış yap</button>
    </>
  )
}

const rolAdi = (r: string) => (r === 'kurucu' ? 'Kulüp kurucusu' : r === 'yonetici' ? 'Yönetici' : 'Üye')

/**
 * "Eylül 2026'dan beri". Ek yılın son rakamının okunuşuna göre değişiyor:
 * 2025 beş ile bitiyor ("'ten"), 2026 altı ile ("'dan").
 */
const YIL_EKI = ['dan', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan']

function aydanBeri(t: string) {
  const d = new Date(t)
  const g = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  const yil = d.getFullYear()
  return `${ayAdi(g)} ${yil}'${YIL_EKI[yil % 10]} beri`
}

function asamaCumlesi(e: Etkinlik) {
  const a = asama(e)
  if (a === 'baslamadi') return `Yükleme açılışı: ${saatYaz(e.yukleme_baslar)}`
  if (a === 'yukleme') return `Yükleme açık · ${kalanYaz(e.yukleme_biter)} kaldı`
  return `Oylama açık · ${kalanYaz(e.oylama_biter)} kaldı`
}
