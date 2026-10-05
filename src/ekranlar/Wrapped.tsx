import { useEffect, useRef, useState } from 'react'
import '../wrapped.css'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik } from '../lib/tipler'
import { git } from '../lib/yol'
import { imzala } from '../lib/imza'
import { acilisKareleri, type Ozet, type SK, type Tema } from './wrapped/plan'
import { iki } from './wrapped/bicim'
import { setSec } from './wrapped/kutuphane'

/**
 * Wrapped: sonuç açılışı (karar 39). Spec: ideations/creatorgraphers/2026-09-20_wrapped-spec.md
 * Tasarım: F1 dili, kart başına renk takımı, her kartın kendi hareketi, bir kez oynar ve durur.
 * Gezinme Instagram hikâyesi gibi: sağ yarı ileri, sol yarı geri, zamanlayıcı yok (karar 39'a ek).
 */

// Tipler ve kart planı wrapped/plan.ts'te; kartları kütüphanedeki set çiziyor (karar 126)

// Etkinlik başına bir kez bakılıyor: uygulama açıkken sonuç açılırsa bir sonraki tazelemede de yakalansın
const bakilan = new Set<string>()
/**
 * Sonuç açıldıktan sonra uygulamanın ilk açılışında Wrapped kendiliğinden açılır, bir kez
 * (izlendi kaydı sunucuda). Yalnız son yedi günde sonuçlanan etkinlik: bu özellik yayına
 * girdiğinde eski etkinlikler için açılmasın.
 */
/** Wrapped'in kendiliğinden açılabileceği etkinlik: son yedi günde sonuçlanan en yenisi. */
function wrappedAdayi(etkinlikler: Etkinlik[], asamaBul: (e: Etkinlik) => string) {
  const yedi = Date.now() - 7 * 86400000
  return etkinlikler
    .filter(x => !x.iptal && asamaBul(x) === 'sonuc' && Date.parse(x.oylama_biter) > yedi)
    .sort((a, b) => Date.parse(b.oylama_biter) - Date.parse(a.oylama_biter))[0]
}

/** Kişinin henüz izlemediği Wrapped'in etkinliği (yoksa null). Ana ekran bu etkinliğin
 *  kazananını Wrapped'den önce göstermiyor: açılışın sürprizi (karar 39). */
export async function izlenmemisWrapped(etkinlikler: Etkinlik[], asamaBul: (e: Etkinlik) => string) {
  const e = wrappedAdayi(etkinlikler, asamaBul)
  if (!e) return null
  const { data, error } = await sb.rpc('wrapped_ozeti', { p_etkinlik: e.id })
  if (error) return e.id   // bilinmiyorsa göstermemek güvenli taraf
  const o = ((data ?? []) as Ozet[])[0]
  return o && !o.izlendi && Number(o.kare) > 0 ? e.id : null
}

export async function wrappedGerekirseAc(etkinlikler: Etkinlik[], asamaBul: (e: Etkinlik) => string) {
  const e = wrappedAdayi(etkinlikler, asamaBul)
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
      // Kontakt baskının açılış şeridi rastgele kareler gösteriyor (karar 126): onlar da
      const acilis = new Set(setSec(e).ad === 'kontakt' ? acilisKareleri(e, kareler).map(k => k.id) : [])
      const gerek = kareler.filter(k => k.benim || acilis.has(k.id) || (k.sira != null && k.sira <= 3 && !k.cikarildi))
      const imza = gerek.length ? await imzala(gerek.map(k => k.dosya)) : []
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

  const set = setSec(v.e)
  const kartlar = set.kur(v, { sonuca, paylas: () => { izle(); git(`paylas/${etkinlikId}`) }, tekrar: () => { setI(0); setZiyaret(z => ({ ...z, 0: (z[0] ?? 0) + 1 })) } })
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
          <div className={`tel ${set.sinif} ${kart.sinif}`} data-kart={kart.ad} data-set={set.ad}>
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
