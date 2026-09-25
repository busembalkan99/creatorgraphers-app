import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import '../wrapped.css'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik } from '../lib/tipler'
import { ayAdi } from '../lib/zaman'
import { git } from '../lib/yol'
import { paylasilacakKare } from './Paylas'

/**
 * Wrapped: sonuç açılışı (karar 39). Spec: ideations/creatorgraphers/2026-09-20_wrapped-spec.md
 * Tasarım: F1 dili, kart başına renk takımı, her kartın kendi hareketi, bir kez oynar ve durur.
 * Gezinme Instagram hikâyesi gibi: sağ yarı ileri, sol yarı geri, zamanlayıcı yok (karar 39'a ek).
 */

type SK = {
  id: string; tema: string; tema_ad: string; tema_sira: number; dosya: string; genislik: number; yukseklik: number
  sahip: string; sahip_ad: string; benim: boolean; ortalama: number | null; oy_sayisi: number | null
  sira: number | null; sirali: boolean; cikarildi: boolean; cikarma_nedeni: string | null; url?: string | null
}
type Ozet = { kisi: number; kare: number; puan: number; benim_oyum: number; izlendi: boolean }
type Tema = { id: string; ad: string; sira: number }

const iki = (n: number) => String(n).padStart(2, '0')
const puan = (n: number | null) => (n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const SAYI = ['sıfır', 'bir', 'iki', 'üç']
const buyuk = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)
/** "Selin Arı" → iki satır: ad ve soyad kartta alt alta duruyor */
function Ad({ ad, className }: { ad: string; className?: string }) {
  const [on, ...son] = ad.split(' ')
  return <span className={`w-ad ${className ?? ''}`}>{on}{son.length > 0 && <><br />{son.join(' ')}</>}</span>
}
function Foto({ k, stil }: { k?: SK; stil?: CSSProperties }) {
  return k?.url ? <img src={k.url} alt="" draggable={false} style={stil} /> : <span className="bos-foto" />
}
/** Kilometre sayacı: sayıdan sıfıra on adım, CSS alttan yukarı çeviriyor */
function Rulo({ n, cls }: { n: number; cls: string }) {
  const d = Array.from({ length: 10 }, (_, i) => Math.round((n * (9 - i)) / 9))
  return <span className="sayi"><span className={`rulo ${cls}`}>{d.map((x, i) => <span key={i}>{x}</span>)}</span></span>
}

// Etkinlik başına bir kez bakılıyor: uygulama açıkken sonuç açılırsa bir sonraki tazelemede de yakalansın
const bakilan = new Set<string>()
/**
 * Sonuç açıldıktan sonra uygulamanın ilk açılışında Wrapped kendiliğinden açılır, bir kez
 * (izlendi kaydı sunucuda). Yalnız son yedi günde sonuçlanan etkinlik: bu özellik yayına
 * girdiğinde eski etkinlikler için açılmasın.
 */
export async function wrappedGerekirseAc(etkinlikler: Etkinlik[], asamaBul: (e: Etkinlik) => string) {
  const yedi = Date.now() - 7 * 86400000
  const e = etkinlikler
    .filter(x => !x.iptal && asamaBul(x) === 'sonuc' && Date.parse(x.oylama_biter) > yedi)
    .sort((a, b) => Date.parse(b.oylama_biter) - Date.parse(a.oylama_biter))[0]
  if (!e || bakilan.has(e.id)) return
  bakilan.add(e.id)
  const { data, error } = await sb.rpc('wrapped_ozeti', { p_etkinlik: e.id })
  if (error) { bakilan.delete(e.id); throw error }
  const o = ((data ?? []) as Ozet[])[0]
  if (o && !o.izlendi && Number(o.kare) > 0) git(`wrapped/${e.id}`)
}

export function Wrapped({ etkinlikId }: { etkinlikId: string }) {
  const [v, setV] = useState<{ e: Etkinlik; temalar: Tema[]; kareler: SK[]; ozet: Ozet } | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [i, setI] = useState(0)
  const [ziyaret, setZiyaret] = useState<Record<number, number>>({})
  const bitti = useRef(false)
  const basla = useRef<number | null>(null)
  const kaydirdi = useRef(false)
  // Klavyeyle gezinen için: açılır açılmaz oklar çalışsın
  const kok = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      const [ev, tm, sk, oz] = await sor(Promise.all([
        sb.from('etkinlikler').select('*').eq('id', etkinlikId).maybeSingle(),
        sb.from('temalar').select('id, ad, sira').eq('etkinlik', etkinlikId).order('sira'),
        sb.rpc('sonuc_kareleri', { p_etkinlik: etkinlikId }),
        sb.rpc('wrapped_ozeti', { p_etkinlik: etkinlikId }),
      ]))
      for (const r of [ev, tm, sk, oz]) if (r.error) throw r.error
      const ozet = ((oz.data ?? []) as Ozet[])[0]
      const e = ev.data as Etkinlik | null
      // Sonuç açılmadıysa ya da etkinlikte kare yoksa Wrapped yok, doğrudan sonuç ekranı
      if (!e || !ozet || Number(ozet.kare) === 0) return git(`sonuc/${etkinlikId}`)
      const kareler = (sk.data ?? []) as SK[]
      // Fotoğraflar önce: kazananlar, kürsü ve kişinin kendi kareleri
      const gerek = kareler.filter(k => k.benim || (k.sira != null && k.sira <= 3 && !k.cikarildi))
      const imza = gerek.length ? (await sb.storage.from('kareler').createSignedUrls(gerek.map(k => k.dosya), 3600)).data ?? [] : []
      const url = new Map(gerek.map((k, j) => [k.id, imza[j]?.signedUrl ?? null]))
      await Promise.race([
        Promise.all([...url.values()].filter(Boolean).map(u => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = u! }))),
        new Promise(r => setTimeout(r, 4000)),
      ])
      setV({ e, temalar: (tm.data ?? []) as Tema[], kareler: kareler.map(k => ({ ...k, url: url.get(k.id) ?? null })),
        ozet: { ...ozet, kisi: Number(ozet.kisi), kare: Number(ozet.kare), puan: Number(ozet.puan), benim_oyum: Number(ozet.benim_oyum) } })
    })().catch(x => setHata(hataMetni(x)))
  }, [etkinlikId])

  // Supabase sorgusu .then çağrılmadan gönderilmiyor: `void sb.rpc(...)` hiç çalışmıyordu
  useEffect(() => { if (v) kok.current?.focus() }, [v])
  const izle = () => { if (!bitti.current) { bitti.current = true; sb.rpc('wrapped_izle', { p_etkinlik: etkinlikId }).then(() => {}) } }
  const sonuca = () => { izle(); git(`sonuc/${etkinlikId}`) }

  if (hata) return <div className="wr"><div className="w-sahne"><div className="w-yukleniyor">{hata}</div></div></div>
  if (!v) return <div className="wr"><div className="w-sahne"><div className="w-yukleniyor">Sonuçlar geliyor</div></div></div>

  const kartlar = kartlariKur(v, { sonuca, paylas: () => { izle(); git(`paylas/${etkinlikId}`) }, tekrar: () => { setI(0); setZiyaret(z => ({ ...z, 0: (z[0] ?? 0) + 1 })) } })
  const n = kartlar.length
  const git_ = (j: number) => {
    if (j < 0 || j >= n) return
    setI(j)
    setZiyaret(z => ({ ...z, [j]: (z[j] ?? 0) + 1 }))   // geri dönülürse kart yeniden oynasın
    if (j === n - 1) izle()                              // sona gelen izlemiş sayılır
  }
  const kart = kartlar[i]

  return (
    <div className="wr" lang="tr" ref={kok}
      onPointerDown={ev => { basla.current = ev.clientX; kaydirdi.current = false }}
      onPointerUp={ev => {
        if (basla.current == null) return
        const dx = ev.clientX - basla.current
        basla.current = null
        if (Math.abs(dx) > 40) { kaydirdi.current = true; git_(dx < 0 ? i + 1 : i - 1) }
      }}
      onClick={ev => {
        if (kaydirdi.current) return
        if ((ev.target as HTMLElement).closest('button')) return
        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
        git_(ev.clientX - r.left < r.width / 2 ? i - 1 : i + 1)
      }}
      onKeyDown={ev => { if (ev.key === 'ArrowRight') git_(i + 1); if (ev.key === 'ArrowLeft') git_(i - 1) }}
      tabIndex={0}>
      <div className="w-sahne">
        <div className={kart.kisi ? 'kisi' : undefined} key={`${i}-${ziyaret[i] ?? 0}`}>
          <div className={`tel ${kart.sinif}`} data-kart={kart.ad}>
            <div className="doku" /><div className="bant-ust" /><div className="bant-alt" />
            <div className="ilerleme" aria-hidden="true">{kartlar.map((_, j) => <i key={j} className={j <= i ? 'w-d' : ''} />)}</div>
            <span className="w-kunye">Creatorgraphers</span>
            <button className="atla" onClick={sonuca}>{i === n - 1 ? 'Kapat' : 'Atla'}</button>
            {kart.govde}
            <div className="sayac"><span>{iki(i + 1)} / {iki(n)}</span><span>{kart.sag}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

type Kart = { ad: string; sinif: string; kisi?: boolean; govde: ReactNode; sag: string }

function kartlariKur(
  { e, temalar, kareler, ozet }: { e: Etkinlik; temalar: Tema[]; kareler: SK[]; ozet: Ozet },
  eylem: { sonuca: () => void; paylas: () => void; tekrar: () => void },
): Kart[] {
  const ay = ayAdi(e.bulusma_gunu)
  const yil = e.bulusma_gunu.slice(0, 4)
  const yarisan = kareler.filter(k => !k.cikarildi)
  const temaKareleri = (t: string) => yarisan.filter(k => k.tema === t)
  const kazananlar = (t: string) => temaKareleri(t).filter(k => k.sirali && k.sira === 1)
  // Temayı kimse oylamamışsa kartı açılmıyor (sonuç ekranının kuralı)
  const oylanan = temalar.filter(t => kazananlar(t.id).length > 0)
  const K: Kart[] = []

  // 1 · Açılış
  K.push({
    ad: 'acilis', sinif: 'k1', sag: `${ay} · ${yil}`,
    govde: (
      <div className="w-ic">
        <span className="w-etiket e1">{ay} etkinliği / Bitti</span>
        <div className="w-baslik e2">Sonuçlar<br /><span className="vurgu">geldi</span></div>
        <div className="satirlar">
          <div className="w-satir s1"><span className="mono">Kişi<br />katıldı</span><Rulo n={ozet.kisi} cls="" /></div>
          <div className="w-satir s2"><span className="mono">Kare<br />yüklendi</span><Rulo n={ozet.kare} cls="r2" /></div>
          <div className="w-satir s3"><span className="mono">Puan<br />verildi</span><Rulo n={ozet.puan} cls="r3" /></div>
        </div>
      </div>
    ),
  })

  // 2-4 · Temanın birincisi, tema başına (karar 111)
  for (const t of oylanan) {
    const w = kazananlar(t.id)
    const tek = temaKareleri(t.id).length === 1
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
              <div className="alt-satir"><span className="w-ad p4">{w.length === 2 ? 'İki' : buyuk(SAYI[w.length] ?? String(w.length))} kare<br />eşit puan aldı</span><span className="puan-kutu p5">{puan(w[0].ortalama)}</span></div>
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
  }

  // 3* · Kürsü: yalnız tek temalı etkinlikte
  if (temalar.length === 1 && oylanan.length === 1) {
    const t = oylanan[0]
    const ilk = kazananlar(t.id)[0]
    const kursu = temaKareleri(t.id).filter(k => k.sirali && (k.sira === 2 || k.sira === 3))
      .sort((a, b) => (a.sira ?? 9) - (b.sira ?? 9)).slice(0, 2)
    if (kursu.length > 0 && ilk.ortalama != null) {
      const farklar = kursu.map(k => (ilk.ortalama! - (k.ortalama ?? 0)))
      const az = farklar.every(f => f <= 0.5)
      const girdi = temaKareleri(t.id).filter(k => k.sirali).length
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
    }
  }

  // 4* · Tema tema: yalnız iki temalı etkinlikte. Ortalama yerine en yüksek puan: temanın
  // bütün ortalaması, sıralamaya girmeyen kareler hakkında gizli olan bir şeyi söylerdi (karar 52).
  if (temalar.length === 2) {
    const sayilar = temalar.map(t => temaKareleri(t.id).length)
    const toplam = sayilar.reduce((a, b) => a + b, 0)
    const blok = Math.max(1, Math.ceil(Math.max(...sayilar) / 14))
    let gecikme = 0
    K.push({
      ad: 'temalar', sinif: 'k4', sag: blok === 1 ? 'Her blok bir kare' : `Her blok ${blok} kare`,
      govde: (
        <>
          <div className="kafa" />
          <div className="w-ic">
            <span className="w-etiket">{ay} / Tema tema</span>
            <div className="w-baslik">İki tema<br /><span className="vurgu">{toplam} kare</span></div>
            <div className="tablo">
              {temalar.map((t, j) => {
                const w = kazananlar(t.id)[0]
                const adet = Math.ceil(sayilar[j] / blok)
                return (
                  <div key={t.id} className="w-tema-satir">
                    <div className="w-ust"><span className="tema-ad">{t.ad}</span><span className="mono">{sayilar[j]} kare{w ? ` · en yüksek ${puan(w.ortalama)}` : ''}</span></div>
                    <div className={`cubuk ${j === 0 ? 'kirmizi' : ''}`}>
                      {Array.from({ length: adet }, (_, x) => <i key={x} style={{ animationDelay: `${((gecikme++) * 0.12).toFixed(2)}s` }} />)}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="dip"><span className="mono">En çok kare</span><span className="mono">{sayilar[0] === sayilar[1] ? 'Eşit' : temalar[sayilar[0] > sayilar[1] ? 0 : 1].ad}</span></div>
          </div>
        </>
      ),
    })
  }

  // 5 · Senin karen (altı durum, spec bölüm 5)
  K.push(kisiselKart({ ay, yil, temalar, kareler, yarisan, ozet }))

  // 6 · Kapanış
  K.push({
    ad: 'kapanis', sinif: 'k6', sag: `${ay} · ${yil}`,
    govde: (
      <div className="w-ic">
        <span className="w-etiket">{ay} etkinliği</span>
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
  return K
}

function kisiselKart({ ay, yil, temalar, kareler, yarisan, ozet }:
  { ay: string; yil: string; temalar: Tema[]; kareler: SK[]; yarisan: SK[]; ozet: Ozet }): Kart {
  const benim = kareler.filter(k => k.benim)
  const yarisanBenim = benim.filter(k => !k.cikarildi)
  const sirali = yarisanBenim.filter(k => k.sirali && k.sira != null).sort((a, b) => (a.sira! - b.sira!) || ((b.ortalama ?? 0) - (a.ortalama ?? 0)))
  const temaDolu = (t: string) => yarisan.some(k => k.tema === t && k.sirali)
  // Karar 114: iki temada yarışan karesi varsa kartta ikisi yan yana. Her temanın en iyisi;
  // ikinci kare, gösterilen en iyi sonucun temasından başka temanın en iyisi.
  const iyisi = (l: SK[]) => [...l].sort((a, b) =>
    ((a.sirali && a.sira != null ? a.sira : 99) - (b.sirali && b.sira != null ? b.sira : 99))
    || ((b.ortalama ?? -1) - (a.ortalama ?? -1)))[0] ?? null
  const ikinciOf = (k: SK) => iyisi(yarisanBenim.filter(x => x.tema !== k.tema))
  const sonucYaz = (x: SK) => (x.sirali && x.sira != null ? (x.sira === 1 ? 'birinci' : iki(x.sira)) : 'galeride')
  const fotoKart = (k: SK, ust: ReactNode, satir: ReactNode, alt: ReactNode, sag: string, stil?: CSSProperties): Kart => {
    const ikinci = stil ? null : ikinciOf(k)
    return {
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
    }
  }

  // A · Temayı kazandın
  const kazandi = sirali.find(k => k.sira === 1)
  if (kazandi) {
    const ortak = yarisan.filter(k => k.tema === kazandi.tema && k.sirali && k.sira === 1).length > 1
    // Karar 114 ile iki kare yan yana: iki temayı da kazandıysa metin de ikisini söylüyor
    const ikinci = ikinciOf(kazandi)
    const ikisi = !ortak && ikinci?.sirali && ikinci.sira === 1
      && !yarisan.some(k => k.tema === ikinci.tema && k.id !== ikinci.id && k.sirali && k.sira === 1)
    return fotoKart(kazandi,
      ortak ? <>Ortak<br /><span className="vurgu">birinci oldun</span></>
        : ikisi ? <>İki temayı<br /><span className="vurgu">sen kazandın</span></>
        : <>Temayı<br /><span className="vurgu">sen kazandın</span></>,
      ortak ? `${kazandi.tema_ad} temasında ortak birinci oldun`
        : ikisi ? `${kazandi.tema_ad} ve ${ikinci!.tema_ad} temalarının birincisi`
        : `${kazandi.tema_ad} temasının birincisi`,
      <><span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(kazandi.ortalama)}</b></span><span className="no-kutu">01</span></>,
      `${kazandi.oy_sayisi ?? 0} kişi puanladı`)
  }
  // B · Sıralamaya girdin (en iyisi; birden çok temada girdiyse söyleniyor)
  if (sirali.length) {
    const k = sirali[0]
    const kac = new Set(sirali.map(x => x.tema)).size
    return fotoKart(k, <>Senin<br /><span className="vurgu">karen</span></>,
      kac > 1 ? <>{buyuk(SAYI[kac] ?? String(kac))} temada<br />sıralamaya girdin</> : `${k.tema_ad} temasında sıralamaya girdin`,
      <><span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(k.ortalama)}</b></span><span className="no-kutu">{iki(k.sira!)}</span></>,
      `${k.oy_sayisi ?? 0} kişi puanladı`)
  }
  // C · Sıralamaya girmedi (puanı yalnız kendisine açık, karar 52)
  if (yarisanBenim.length) {
    const k = [...yarisanBenim].sort((a, b) => (b.ortalama ?? -1) - (a.ortalama ?? -1))[0]
    const n = yarisan.filter(x => x.tema === k.tema).length
    if (!temaDolu(k.tema)) {
      return fotoKart(k, <>Senin<br /><span className="vurgu">karen</span></>, 'Bu temayı kimse oylamamış',
        <><span className="mono">Puan yok</span><span className="mono" style={{ textAlign: 'right' }}>Temada<br />{n} kare vardı</span></>, `${ay} · ${k.tema_ad}`)
    }
    return fotoKart(k, <>Senin<br /><span className="vurgu">karen</span></>,
      k.ortalama == null ? 'Bu kareye kimse puan vermemiş' : <>Sıralamaya girmedi, puanını<br />yalnız sen görüyorsun</>,
      <>{k.ortalama == null ? <span className="mono">Puan yok</span> : <span className="sari-etiket"><span className="mono">Ortalaman</span><b>{puan(k.ortalama)}</b></span>}
        <span className="mono" style={{ textAlign: 'right' }}>Temada<br />{n} kare vardı</span></>,
      `${k.oy_sayisi ?? 0} kişi puanladı`)
  }
  // F · Karen yarışmadan çıkarıldı (başka kimse bu kartı görmez, karar 103)
  const cikan = benim.find(k => k.cikarildi)
  if (cikan) {
    return fotoKart(cikan, <>Karen<br /><span className="vurgu">yarışmada yok</span></>,
      <>Yarışmadan çıkarıldı{cikan.cikarma_nedeni ? <>:<br />{cikan.cikarma_nedeni}</> : null}</>,
      <><span className="mono">Puan sayılmadı</span><span className="mono" style={{ textAlign: 'right' }}>Yöneticiyle<br />konuşabilirsin</span></>,
      `${ay} · ${cikan.tema_ad}`, { filter: 'grayscale(1) opacity(.55)' })
  }
  // D · Kare yok, oy var
  if (ozet.benim_oyum > 0) {
    const hepsi = ozet.benim_oyum >= ozet.kare
    return {
      ad: 'kisisel', sinif: 'k5', kisi: true, sag: `${ozet.benim_oyum} / ${ozet.kare} kare`,
      govde: (
        <div className="w-ic">
          <span className="w-etiket">Sen / {ay}</span>
          <div className="w-baslik">Bu ay<br /><span className="vurgu">oy verdin</span></div>
          <div className="w-kutu" style={{ marginTop: 32 }}><div className="mono">Puanladığın kare</div><div className="dev" style={{ marginTop: 8 }}>{ozet.benim_oyum}</div></div>
          <div className="w-ad" style={{ marginTop: 24 }}>{hepsi ? 'Bütün kareleri puanladın' : `${ozet.benim_oyum} kareyi puanladın`}</div>
          <div className="alt-satir"><span className="mono">Kare vermedin</span><span className="mono" style={{ textAlign: 'right' }}>Sıradaki etkinliğe<br />mutlaka gel</span></div>
        </div>
      ),
    }
  }
  // E · Hiç katılmadın (kulübe sonradan katılan da bunu görür)
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
