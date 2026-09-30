import { useEffect, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import { git } from '../lib/yol'
import { gunYaz } from '../lib/zaman'
import { bellegeYaz, bellektenAl } from '../lib/onbellek'
import { Hata, Kunye } from '../bilesenler/Kunye'

/**
 * Tema önerisi (kararlar 81, 82, 85, 89, 121). Kişi başı 3 açık öneri, aynısı birleşir,
 * geri çekilir ama düzenlenmez. Havuzu yalnız yönetici görür (önerenlerin adıyla).
 */
type Benim = { id: string; ad: string; durum: 'havuzda' | 'secildi'; bulusma_gunu: string | null; serbest: boolean | null }
type Kalem = { id: string; ad: string; elle: boolean; onerenler: string; kac_kisi: number; bekledigi: number; gerekceler: { ad: string; gerekce: string }[] }
const onerilerimiOku = async () => {
  const { data, error } = await sb.rpc('onerilerim')
  if (error) throw error
  return (data ?? []) as Benim[]
}

/** Etkinlikler'de, açık etkinlik yokken. İlk karede çiziliyor (altındaki liste kaymasın); sayı gelince
 *  ekleniyor, dönüşte bellekten. */
export function OneriKarti({ uyeId }: { uyeId: string }) {
  const anahtar = `${uyeId}:oneriler`
  const [l, setL] = useState<Benim[]>(() => bellektenAl<Benim[]>(anahtar) ?? [])
  useEffect(() => { onerilerimiOku().then(d => setL(bellegeYaz(anahtar, d))).catch(() => {}) }, [anahtar])
  const havuzda = l.filter(x => x.durum === 'havuzda').length
  return (
    <div className="kart oneri-karti belir">
      <b>Tema öner</b>
      <span>Sıradaki buluşma için aklına bir tema geldiyse bırak.</span>
      {havuzda > 0 && havuzda < 3 && <span>Havuzda {havuzda} önerin var.</span>}
      {havuzda >= 3
        ? <span>Üç önerin havuzda. Biri seçilince ya da geri çekince yenisini bırakabilirsin.</span>
        : <div className="akt"><button className="btn kucuk" onClick={() => git('oner')}>Tema öner</button></div>}
    </div>
  )
}

export function OneriFormu() {
  const [ad, setAd] = useState('')
  const [gerekce, setGerekce] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [gidiyor, setGidiyor] = useState(false)
  async function birak() {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('oneri_birak', { p_ad: ad, p_gerekce: gerekce.trim() || null })
    setGidiyor(false)
    if (error) return setHata(error.message.includes('oneri_siniri') ? 'Üç önerin havuzda. Birini geri çekince yenisini bırakabilirsin.' : hataMetni(error))
    git('profil')
  }
  return (
    <div className="sc">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Tema öner" />
      <h2 className="t orta">Tema<br />öner</h2>
      <p className="lede">Yönetici etkinlik kurarken havuzdan seçiyor. Havuzu yalnız yönetici görüyor.</p>
      <div className="alan">
        <label className="lab" htmlFor="oneri-ad">Tema</label>
        <input id="oneri-ad" value={ad} maxLength={24} placeholder="ÖRNEK: GECE" autoCapitalize="words" autoCorrect="off"
          spellCheck={false} enterKeyHint="next" onChange={e => setAd(e.target.value)} />
      </div>
      <div className="alan">
        <label className="lab" htmlFor="oneri-gerekce">Neden · isteğe bağlı</label>
        <input id="oneri-gerekce" value={gerekce} maxLength={140} enterKeyHint="done" onChange={e => setGerekce(e.target.value)} />
      </div>
      <Hata metin={hata} />
      <button className="btn" disabled={!ad.trim() || gidiyor} onClick={birak}>{gidiyor ? 'Bırakılıyor' : 'Öneriyi bırak'}</button>
    </div>
  )
}

/** Profil'de, kendi profilinde. Önerin yoksa bölüm yok. Etkinlikler'deki kartla aynı bellek:
 *  ikinci açılışta ilk karede yerinde, Ayarlar ve "Çıkış yap" kaymıyor. */
export function Onerilerim({ uyeId }: { uyeId: string }) {
  const anahtar = `${uyeId}:oneriler`
  const [l, setL] = useState<Benim[]>(() => bellektenAl<Benim[]>(anahtar) ?? [])
  const oku = () => onerilerimiOku().then(d => setL(bellegeYaz(anahtar, d))).catch(() => {})
  useEffect(() => { oku() }, [anahtar]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!l.length) return null
  return (
    <>
      <h2 className="kart-bas">Önerilerin<span>{l.filter(x => x.durum === 'havuzda').length} / 3 havuzda</span></h2>
      <div className="satir-kartlari onerilerim">
        {l.map(o => (
          <div className="satir" key={o.id}>
            <div className="tx">
              <b>{o.ad}</b>
              <span>{o.durum === 'secildi' ? `Seçildi · ${o.serbest ? 'Ekstra etkinlik' : gunYaz(o.bulusma_gunu!, false)}` : 'Havuzda'}</span>
            </div>
            {o.durum === 'havuzda' && (
              <button className="deg" onClick={async () => { await sb.rpc('oneri_geri_cek', { p_oneri: o.id }); oku() }}>Geri çek</button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/** Havuz: `#/havuz`'da salt okunur, Kurulum'da seçim listesi. Yalnız yönetici. */
export function Havuz({ secim }: { secim?: { secili: string[]; sec(o: { id: string; ad: string }): void } }) {
  const [l, setL] = useState<Kalem[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  useEffect(() => {
    sb.rpc('havuz').then(({ data, error }) => { if (error) setHata(hataMetni(error)); else setL((data ?? []) as Kalem[]) })
  }, [])
  const alt = (k: Kalem) => `${k.elle ? 'Yönetici yazdı' : k.onerenler}${k.bekledigi ? ` · ${k.bekledigi} etkinliktir havuzda` : ''}`
  // Gerekçe sahibiyle, yalnız yöneticiye (Buse, 2026-09-30)
  const neden = (k: Kalem) => k.gerekceler.map(g => <span className="gerekce" key={g.ad}>“{g.gerekce}” · {g.ad}</span>)

  if (secim) {
    if (!l?.length) return null
    return (
      <>
        <h2 className="kart-bas">Havuzdan seç<span>{l.length} öneri</span></h2>
        <div className="satir-kartlari havuz-sec">
          {l.map(k => {
            const secili = secim.secili.includes(k.id)
            return (
              <button className="izin" key={k.id} aria-pressed={secili} onClick={() => secim.sec(k)}>
                <span className={`box ${secili ? 'on' : ''}`} />
                <span><b>{k.ad}</b><span>{alt(k)}</span>{neden(k)}</span>
              </button>
            )
          })}
        </div>
      </>
    )
  }
  return (
    <div className="sc">
      <Kunye sol="Profil" geri="profil" sag="Yönetim" />
      <h2 className="t orta">Tema<br />havuzu</h2>
      <p className="lede">Etkinlik kurarken buradan seçersin. Önerenlerin adını yalnız yöneticiler görüyor.</p>
      <Hata metin={hata} />
      {/* Büyük başlık → açıklama → bölüm başlığı → kartlar (karar 119); başlıksız liste açıklamaya yapışıyordu */}
      {l && <h2 className="kart-bas">Öneriler<span>{l.length} öneri</span></h2>}
      {l && !l.length && <div className="kart bos-kart"><b>Havuz boş</b><span>Üyeler tema önerince burada görünür.</span></div>}
      {l && l.length > 0 && (
        <div className="satir-kartlari">
          {l.map(k => (
            <div className="satir" key={k.id}>
              <div className="tx"><b>{k.ad}</b><span>{alt(k)}</span>{neden(k)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
