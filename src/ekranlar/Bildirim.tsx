import { useEffect, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import { saatYaz } from '../lib/zaman'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

// Yöneticinin elle bildirimi (spec 2026-10-06_elle-bildirim_v1). Ekran yalnız sayı gösteriyor (kararlar 9, 52).
type Tur = 'tema_oner' | 'yukleme' | 'oy' | 'tahmin' | 'wrapped' | 'bulusma'
// alici: fotoğrafa bağlı hatırlatmalarda (yükleme, oy, tahmin) null; sayı sahibini ele verebiliyordu (kod incelemesi F1)
interface Hatirlatma { tur: Tur; gorunur: boolean; alici: number | null; bugun: boolean; etiket: string | null }
interface Durum {
  kalan: number; abone: number; gece: boolean; hatirlatmalar: Hatirlatma[]
  son: { tur: Tur | 'serbest'; baslik: string; alici: number | null; zaman: string }[]
}

const ETIKET: Record<Tur, { ad: string; kime: (e: string | null) => string; kimseYok: string }> = {
  tema_oner: { ad: 'Tema önerebilirsin', kime: () => 'Açık önerisi olmayanlara', kimseYok: 'Herkesin açık önerisi var' },
  yukleme: { ad: 'Fotoğraf yüklemedin', kime: () => 'Boş teması olanlara', kimseYok: 'Herkes bütün temalara kare verdi' },
  oy: { ad: 'Oy vermedin', kime: () => 'Oylaması eksik olanlara', kimseYok: 'Herkes oylamasını bitirdi' },
  tahmin: { ad: 'Tahmin oyunu seni bekliyor', kime: () => 'Oylamasını bitirip oyunu açmamış olanlara', kimseYok: 'Oyunu açabilecek herkes açtı' },
  wrapped: { ad: "Wrapped'ini izlemedin", kime: e => e === 'Ekstra etkinlik' ? "Ekstra etkinliğin Wrapped'ini açmamış olanlara" : `${e ?? 'Son'} buluşmasının Wrapped'ini açmamış olanlara`, kimseYok: 'Herkes izledi' },
  bulusma: { ad: 'Buluşma günü', kime: () => 'Bildirimi açık herkese', kimseYok: 'Bildirimi açık üye yok' },
}
const YERLER = [['etkinlikler', 'Etkinlikler'], ['siralama', 'Sıralama'], ['oner', 'Tema öner'], ['profil', 'Profil']] as const

// Gece 23.00 ile 08.00 arası (İstanbul): onay açıldığı anda bakılıyor, ekranın yüklendiği anda değil
const geceMi = () => {
  const s = Number(new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()))
  return s >= 23 || s < 8
}
const hakMetni = (k: number) => k >= 2 ? 'Bugün 2 hakkın var' : k === 1 ? 'Bugün 1 hakkın kaldı' : 'Bugünkü hakların doldu. Yarın yeniden gönderebilirsin.'

export function BildirimGonder() {
  const [d, setD] = useState<Durum | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [onay, setOnay] = useState<{ tur: Tur | 'serbest'; gece: boolean } | null>(null)
  // Gönderim sonucu, gönderilen satırın hemen altında (ekranın üstündeki hata telefonda görünmüyordu)
  const [sonuc, setSonuc] = useState<{ tur: Tur | 'serbest'; metin: string; hata: boolean } | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const [baslik, setBaslik] = useState('')
  const [metin, setMetin] = useState('')
  const [yer, setYer] = useState<string>('etkinlikler')

  const yukle = () => sb.rpc('elle_bildirim_durumu').then(({ data, error }) => {
    if (error) setHata(hataMetni(error)); else setD(data as Durum)
  })
  useEffect(() => { yukle() }, [])

  async function gonder(tur: Tur | 'serbest', gece: boolean) {
    setMesgul(true); setHata(null); setSonuc(null)
    const { data, error } = await sb.rpc('elle_bildirim_gonder', tur === 'serbest'
      ? { p_tur: 'serbest', p_baslik: baslik, p_govde: metin, p_adres: yer }
      : { p_tur: tur })
    setMesgul(false); setOnay(null)
    if (error) setSonuc({ tur, metin: hataMetni(error), hata: true })
    else {
      const kac = typeof data === 'number' ? `${data} kişiye gönderildi.` : 'İşi kalanlara gönderildi.'
      setSonuc({ tur, metin: gece ? `${kac} Sabah 08.00'de gidecek.` : kac, hata: false })
      if (tur === 'serbest') { setBaslik(''); setMetin('') }
    }
    yukle()   // hatada da: sayılar ve hak güncellensin
  }

  const onayKutusu = (tur: Tur | 'serbest', n: number | null) => (
    <>
      {onay?.tur === tur && (
        <div className="onaykutu onay">
          <b>{n === null ? 'İşi kalanlara gönderilsin mi?' : `${n} kişiye gönderilsin mi?`}</b>
          {onay.gece && <p>Sabah 08.00'de gidecek.</p>}
          <div className="akt">
            <button className="btn ik kucuk" onClick={() => setOnay(null)}>Vazgeç</button>
            <button className="btn kucuk" disabled={mesgul} onClick={() => gonder(tur, onay.gece)}>Gönder</button>
          </div>
        </div>
      )}
      {sonuc?.tur === tur && <div className={sonuc.hata ? 'hata' : 'ipucu gonderildi'} role={sonuc.hata ? 'alert' : 'status'}>{sonuc.metin}</div>}
    </>
  )
  const onayAc = (tur: Tur | 'serbest') => { setSonuc(null); setOnay({ tur, gece: geceMi() }) }

  if (!d) return <div className="sc"><Kunye sol="Profil" geri="profil" sag="Yönetim" /><Hata metin={hata} />{!hata && <Yukleniyor />}</div>
  const hakYok = d.kalan <= 0
  const serbestHazir = !!baslik.trim() && !!metin.trim() && d.abone > 0 && !hakYok
  const etiketAdi = (t: Durum['son'][number]) => t.tur === 'serbest' ? t.baslik : ETIKET[t.tur].ad

  return (
    <div className="sc">
      <Kunye sol="Profil" geri="profil" sag="Yönetim" />
      <h2 className="t orta">Bildirim<br />gönder</h2>
      <p className="lede">{hakMetni(d.kalan)}. Gece 23.00 ile 08.00 arası gönderilen sabah 08.00'de gider.</p>
      <Hata metin={hata} />

      <h2 className="kart-bas">Hatırlatmalar<span>Yalnız işi kalana</span></h2>
      <div className="satir-kartlari">
        {d.hatirlatmalar.filter(h => h.gorunur).map(h => {
          const e = ETIKET[h.tur]
          // Gece gönderilen sabaha kalıyor: sayı sabahın, "herkes bitirdi" demek yanlış olabilir (kod incelemesi F4)
          const alt = d.abone === 0 ? 'Bildirimi açık üye yok'
            : h.alici === null ? 'İşi kalana gidecek'
            : h.alici > 0 ? `${h.alici} kişiye gidecek`
            : h.bugun ? 'Bugün herkese gitti' : d.gece ? 'Şu an kimseye gitmiyor' : e.kimseYok
          return (
            <div key={h.tur}>
              <div className="satir" style={{ cursor: 'default' }}>
                <div className="tx"><b>{e.ad}</b><span>{e.kime(h.etiket)} · {alt}</span></div>
                <button className="deg" disabled={h.alici === 0 || d.abone === 0 || hakYok || mesgul} onClick={() => onayAc(h.tur)}>Gönder</button>
              </div>
              {onayKutusu(h.tur, h.alici)}
            </div>
          )
        })}
      </div>

      <h2 className="kart-bas">Kendin yaz<span>Bildirimi açık {d.abone} kişiye</span></h2>
      <div className="alan">
        <label className="lab" htmlFor="eb-baslik">Başlık</label>
        <input id="eb-baslik" className="not" value={baslik} maxLength={40} onChange={e => setBaslik(e.target.value)} />
        <div className="ipucu">{baslik.length} / 40</div>
      </div>
      <div className="alan">
        <label className="lab" htmlFor="eb-metin">Metin</label>
        <textarea id="eb-metin" className="not" value={metin} maxLength={140} rows={3} onChange={e => setMetin(e.target.value)} />
        <div className="ipucu">{metin.length} / 140</div>
      </div>
      <div className="alan">
        <label className="lab" htmlFor="eb-yer">Açılacak yer</label>
        <select id="eb-yer" value={yer} onChange={e => setYer(e.target.value)}>
          {YERLER.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
        </select>
      </div>
      <div className="bildirim-onizleme" aria-label="Önizleme">
        <span>Creatorgraphers</span>
        <b>{baslik.trim() || 'Başlık'}</b>
        <p>{metin.trim() || 'Metin'}</p>
      </div>
      <button className="btn" disabled={!serbestHazir || mesgul} onClick={() => onayAc('serbest')}>Herkese gönder</button>
      {onayKutusu('serbest', d.abone)}

      {d.son.length > 0 && (
        <>
          <h2 className="kart-bas">Son gönderilenler</h2>
          <div className="satir-kartlari">
            {d.son.map((s, i) => (
              <div className="satir" key={i} style={{ cursor: 'default' }}>
                <div className="tx"><b>{etiketAdi(s)}</b><span>{saatYaz(s.zaman)}{s.alici === null ? '' : ` · ${s.alici} kişi`}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
