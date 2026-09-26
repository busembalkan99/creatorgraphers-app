import { useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import { gunYaz, saatYaz, yerelIso } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye } from '../bilesenler/Kunye'

/**
 * Etkinliği kur (kararlar 26, 29, 32, 33, 72, 85, 88, 91). Prototip: v21 "Etkinliği kur".
 * Tema havuzu (karar 81) sonraki adımda; şimdilik tema elle yazılıyor (karar 85).
 */

interface TemaGirdi { ad: string; bulusmada: boolean }

function sonrakiCumartesi() {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function Kur() {
  const [bulusma, setBulusma] = useState(sonrakiCumartesi)
  const [baslangic, setBaslangic] = useState(() => `${sonrakiCumartesi()}T18:00`)
  const [yukSaat, setYukSaat] = useState('48')
  const [oySaat, setOySaat] = useState('72')
  const [temalar, setTemalar] = useState<TemaGirdi[]>([{ ad: '', bulusmada: true }])
  // Karar 116: serbest (ekstra) etkinlik. Bütün temaları serbest, sezonun altı etkinliğine sayılmaz.
  const [serbest, setSerbest] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [gidiyor, setGidiyor] = useState(false)

  const y = Number(yukSaat), o = Number(oySaat)
  // Serbest etkinlikte konu da serbest olabiliyor: ad boşsa tema "Serbest" (Buse, 2026-09-26)
  const temalarTamam = serbest || temalar.every(t => t.ad.trim().length > 0)
  const temaAdlari = () => {
    let bos = 0
    return temalar.map(t => t.ad.trim() || (++bos === 1 ? 'Serbest' : `Serbest ${bos}`))
  }
  const hazir = !!bulusma && !!baslangic && y >= 1 && o >= 1 && temalarTamam && !gidiyor

  const tema = (i: number, p: Partial<TemaGirdi>) =>
    setTemalar(l => l.map((t, j) => (j === i ? { ...t, ...p } : t)))

  async function kur() {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('etkinlik_kur', {
      p_bulusma: bulusma,
      p_yukleme_baslar: yerelIso(baslangic),
      p_yukleme_saat: y,
      p_oylama_saat: o,
      p_temalar: ((adlar) => temalar.map((t, i) => ({ ad: adlar[i], bulusmada: serbest ? false : t.bulusmada })))(temaAdlari()),
      p_serbest: serbest,
    })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    git('asama')
  }

  const bitis = baslangic && y >= 1 ? saatYaz(new Date(Date.parse(yerelIso(baslangic)) + y * 3_600_000).toISOString()) : ''

  return (
    <div className="sc">
      <Kunye sol="Profil" geri="profil" sag="Yönetim" />
      <h2 className="kart-bas">Yeni etkinlik</h2>

      <div className="alan" style={{ marginTop: 4 }}>
        <span className="lab">Etkinlik türü</span>
        <div className="secim" role="group" aria-label="Etkinlik türü">
          <button className={!serbest ? 'on' : ''} aria-pressed={!serbest} onClick={() => setSerbest(false)}>Buluşma</button>
          <button className={serbest ? 'on' : ''} aria-pressed={serbest} onClick={() => setSerbest(true)}>Serbest · ekstra</button>
        </div>
        {serbest && (
          <div className="ipucu">Sezonun altı etkinliğine sayılmaz, seriyi etkilemez. Bütün temalar serbest: çekim tarihine bakılmaz. Kareler sezon ortalamasına yarım ağırlıkla girer, Sıralama'da ayrı Serbest tablosunda da yer alır. Yoklama yine alınır.</div>
        )}
      </div>

      <div className="alan">
        <label className="lab" htmlFor="bg">Buluşma günü</label>
        <input id="bg" type="date" value={bulusma} onChange={e => setBulusma(e.target.value)} />
        {bulusma && <div className="ipucu">{gunYaz(bulusma)}. {serbest ? 'Etkinliğin tarihi bu gün olarak görünür.' : 'Buluşma temalarında bu günün kareleri geçerli.'}</div>}
      </div>

      <div className="alan">
        <label className="lab" htmlFor="yb">Yükleme açılışı</label>
        <input id="yb" type="datetime-local" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
      </div>

      <div className="iki">
        <div className="alan">
          <label className="lab" htmlFor="ys">Yükleme · saat</label>
          <input id="ys" inputMode="numeric" enterKeyHint="next" value={yukSaat} onChange={e => setYukSaat(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>
        <div className="alan">
          <label className="lab" htmlFor="os">Oylama · saat</label>
          <input id="os" inputMode="numeric" enterKeyHint="next" value={oySaat} onChange={e => setOySaat(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>
      </div>
      {bitis && <div className="ipucu">Son yükleme: {bitis}. Oylama hemen ardından açılır.</div>}
      {y >= 1 && o >= 1 && o < y && (
        <div className="ipucu">Oylama yüklemeden kısa. Bilerek seçtiysen sorun yok.</div>
      )}

      <h2 className="kart-bas">Temalar<span>{temalar.length} / 3</span></h2>
      {temalar.map((t, i) => (
        <div className="kart tema-kur" key={i}>
          <div className="alan">
            <label className="lab" htmlFor={`t${i}`}>Tema {i + 1}</label>
            <input id={`t${i}`} value={t.ad} maxLength={40} placeholder={serbest ? 'BOŞ BIRAKIRSAN: SERBEST' : 'ÖRNEK: SOKAK'}
              autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              onChange={e => tema(i, { ad: e.target.value })} />
          </div>
          {!serbest && <div className="secim" role="group" aria-label="Çekim şartı">
            <button className={t.bulusmada ? 'on' : ''} aria-pressed={t.bulusmada} onClick={() => tema(i, { bulusmada: true })}>Buluşmada</button>
            <button className={!t.bulusmada ? 'on' : ''} aria-pressed={!t.bulusmada} onClick={() => tema(i, { bulusmada: false })}>Serbest</button>
          </div>}
          {temalar.length > 1 && (
            <button className="sil" onClick={() => setTemalar(l => l.filter((_, j) => j !== i))}>Temayı çıkar</button>
          )}
        </div>
      ))}
      {temalar.length < 3 && (
        <button className="btn ik" onClick={() => setTemalar(l => [...l, { ad: '', bulusmada: true }])}>Tema ekle</button>
      )}

      <Hata metin={hata} />
      <button className="btn" disabled={!hazir} onClick={kur}>{gidiyor ? 'Kuruluyor' : 'Etkinliği kur'}</button>
    </div>
  )
}
