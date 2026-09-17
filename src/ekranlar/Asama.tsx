import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Tema } from '../lib/tipler'
import { asama, ayAdi, gunYaz, kalanYaz, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'

/** Aşama kontrolü (karar 26, 35, 89). Prototip: v21 "Aşama kontrolü". */
export function Asama() {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [temalar, setTemalar] = useState<Tema[]>([])
  const [sayilar, setSayilar] = useState<Record<string, number>>({})
  const [hata, setHata] = useState<string | null>(null)
  const [soru, setSoru] = useState<'oylama' | 'iptal' | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)

  async function yukle() {
    const { data, error } = await sor(sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }))
    if (error) throw error
    const acik = acikEtkinlik((data ?? []) as Etkinlik[]) ?? null
    if (!acik) return setE(null)
    const [t, s] = await sor(Promise.all([
      sb.from('temalar').select('*').eq('etkinlik', acik.id).order('sira'),
      sb.rpc('yukleme_sayilari', { p_etkinlik: acik.id }),
    ]))
    if (t.error) throw t.error
    if (s.error) throw s.error
    // Hepsi gelince birlikte: önce etkinlik çizilirse grup mesajı bir an temasız kalıyordu.
    setTemalar((t.data ?? []) as Tema[])
    setSayilar(Object.fromEntries(((s.data ?? []) as { tema: string; adet: number }[]).map(r => [r.tema, Number(r.adet)])))
    setE(acik)
  }

  useEffect(() => {
    yukle().catch(x => setHata(hataMetni(x)))
  }, [])

  async function cagir(fn: string, args: Record<string, unknown>) {
    setHata(null)
    const { error } = await sb.rpc(fn, args)
    setSoru(null)
    if (error) return setHata(hataMetni(error))
    await yukle().catch(x => setHata(hataMetni(x)))
  }

  if (e === undefined) return hata ? <div className="sc"><Kunye sol="Profil" geri="profil" sag="Yönetim" /><Hata metin={hata} /></div> : <Yukleniyor />
  if (e === null) {
    return (
      <div className="sc">
        <Kunye sol="Profil" geri="profil" sag="Yönetim" />
        <h2 className="t orta">Açık<br />etkinlik yok</h2>
        <button className="btn" onClick={() => git('kur')}>Etkinliği kur</button>
      </div>
    )
  }

  const a = asama(e)
  const ay = ayAdi(e.bulusma_gunu)
  const toplam = Object.values(sayilar).reduce((x, y) => x + y, 0)
  const link = window.location.origin + import.meta.env.BASE_URL
  const temaListesi = temalar.map(t => `${t.ad}${t.bulusmada ? '' : ' (serbest)'}`).join(', ')
  const mesaj =
    a === 'oylama'
      ? `${ay} etkinliğinin oylaması açıldı. Her kareye puan vermeyi unutmayın.\nSon oy: ${saatYaz(e.oylama_biter)}\n${link}`
      : `${ay} etkinliği: buluşma ${gunYaz(e.bulusma_gunu)}.\nTemalar: ${temaListesi}\nYükleme açılışı: ${saatYaz(e.yukleme_baslar)}\nSon yükleme: ${saatYaz(e.yukleme_biter)}\n${link}`

  const durum =
    a === 'baslamadi' ? `Yükleme açılışı ${saatYaz(e.yukleme_baslar)}`
      : a === 'yukleme' ? `Yükleme açık · ${kalanYaz(e.yukleme_biter)} kaldı`
        : `Oylama açık · ${kalanYaz(e.oylama_biter)} kaldı`

  return (
    <div className="sc" data-asama={a === 'oylama' ? 'oylama' : 'yukleme'}>
      <Kunye sol="Profil" geri="profil" sag="Yönetim" />
      <div className="sec">{ay} etkinliği<span>{gunYaz(e.bulusma_gunu, false)}</span></div>
      <p className="veri" style={{ marginTop: 0 }}><b>{durum}</b></p>

      <div className="ozet" style={{ marginTop: 12 }}>
        {temalar.map(t => (
          <div key={t.id}>
            <span className="k">{t.bulusmada ? 'Buluşma' : 'Serbest'}</span>
            <span className="v">{t.ad}</span>
            <span className="v" style={{ marginLeft: 'auto', color: 'var(--soft)' }}>{sayilar[t.id] ?? 0} kare</span>
          </div>
        ))}
        <div><span className="k">Son yükleme</span><span className="v">{saatYaz(e.yukleme_biter)}</span></div>
        <div><span className="k">Son oy</span><span className="v">{saatYaz(e.oylama_biter)}</span></div>
      </div>

      {a === 'yukleme' && soru === null && (
        <div className="akt" style={{ marginTop: 14 }}>
          <button className="btn ik" onClick={() => cagir('yukleme_uzat', { p_etkinlik: e.id, p_saat: 24 })}>24 saat uzat</button>
          <button className="btn ik" onClick={() => setSoru('oylama')}>Oylamayı aç</button>
        </div>
      )}
      {soru === 'oylama' && (
        <div className="kutu">
          <div className="bas"><span>Oylama şimdi açılsın mı?</span></div>
          <p>Yükleme kapanır, {toplam} kareyle oylama başlar. Geri alınamaz.</p>
          <div className="akt">
            <button className="btn ik" onClick={() => setSoru(null)}>Vazgeç</button>
            <button className="btn" onClick={() => cagir('oylamayi_ac', { p_etkinlik: e.id })}>Oylamayı aç</button>
          </div>
        </div>
      )}

      <div className="mesaj">
        <span className="lab">Gruba yazılacak</span>
        <p>{mesaj}</p>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(mesaj)
              setKopyalandi(true)
              window.setTimeout(() => setKopyalandi(false), 2000)
            } catch {
              setHata('Kopyalanamadı. Metni basılı tutup kopyala.')
            }
          }}
        >
          {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      <p className="veri">Mesajı gruba sen yapıştıracaksın. Uygulama bildirim göndermiyor.</p>

      <Hata metin={hata} />

      {(a === 'baslamadi' || a === 'yukleme') && (
        <>
          <div className="sec">Etkinliği iptal et</div>
          {soru === 'iptal' ? (
            <div className="kutu" style={{ marginTop: 0 }}>
              <div className="bas"><span>{ay} etkinliği iptal edilsin mi?</span></div>
              <p>{toplam > 0 ? `Yüklenen ${toplam} kare silinir. ` : ''}Geri alınamaz.</p>
              <div className="akt">
                <button className="btn ik" onClick={() => setSoru(null)}>Vazgeç</button>
                <button className="btn" onClick={() => cagir('etkinlik_iptal', { p_etkinlik: e.id })}>İptal et</button>
              </div>
            </div>
          ) : (
            <>
              <p className="veri" style={{ marginTop: 0 }}>Oylama açılana kadar mümkün.</p>
              <button className="btn ik" onClick={() => setSoru('iptal')}>İptali başlat</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
