import { useEffect, useLayoutEffect, useRef, type PointerEvent as PE } from 'react'
import { createPortal } from 'react-dom'

/* Uygulamada sayfa yakınlaştırması kapalı (index.html + index.css); yakından bakmak
   yalnız burada var. Fotoğraf tam ekrana açılır, iki parmakla büyütülür, büyükken tek
   parmakla gezdirilir. Hareketsiz dokunuş ya da tam boya küçültmek kapatır.
   Jestleri kendimiz sayıyoruz: katman touch-action:none, tarayıcı karışmıyor. */

export type Acik = { url: string; baslik: string; sag?: string; olcek?: number }

const EN_BUYUK = 6

export function Buyutec({ acik, kapat }: { acik: Acik; kapat: () => void }) {
  const kat = useRef<HTMLDivElement>(null)
  const res = useRef<HTMLImageElement>(null)
  const d = useRef({ sc: acik.olcek ?? 1, tx: 0, ty: 0 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const bas = useRef({ dist: 0, sc: 1, tx: 0, ty: 0, x: 0, y: 0 })
  const oynadi = useRef(false)
  // Her parmak hareketinde React'e çizdirmek yerine dönüşüm doğrudan resme yazılıyor
  const uygula = () => {
    const { sc, tx, ty } = d.current
    if (res.current) res.current.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`
  }
  useLayoutEffect(uygula, [])

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') kapat() }
    addEventListener('keydown', tus)
    return () => removeEventListener('keydown', tus)
  }, [kapat])

  // Büyütülen görüntü çerçeveden tamamen çıkmasın
  function sinirla() {
    const r = kat.current?.getBoundingClientRect()
    const i = res.current
    if (!r || !i) return
    const s = d.current
    const mx = Math.max(0, (i.clientWidth * s.sc - r.width) / 2)
    const my = Math.max(0, (i.clientHeight * s.sc - r.height) / 2)
    s.tx = Math.max(-mx, Math.min(mx, s.tx))
    s.ty = Math.max(-my, Math.min(my, s.ty))
  }

  function yeniBaslangic() {
    const p = [...pts.current.values()]
    const s = d.current
    if (p.length >= 2) {
      const [a, b] = p
      bas.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), sc: s.sc, tx: s.tx, ty: s.ty, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    } else if (p.length === 1) {
      bas.current = { dist: 0, sc: s.sc, tx: s.tx, ty: s.ty, x: p[0].x, y: p[0].y }
    }
  }

  function indi(e: PE) {
    // Parmak katmanın dışına kaysa da jest sürsün
    try { kat.current?.setPointerCapture(e.pointerId) } catch { /* bitmiş parmak */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) oynadi.current = false
    yeniBaslangic()
  }

  function oynat(e: PE) {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = d.current, b = bas.current
    const p = [...pts.current.values()]
    if (p.length >= 2 && b.dist > 0) {
      const [x, y] = p
      s.sc = Math.max(1, Math.min(EN_BUYUK, b.sc * (Math.hypot(x.x - y.x, x.y - y.y) / b.dist)))
      s.tx = b.tx + ((x.x + y.x) / 2 - b.x)
      s.ty = b.ty + ((x.y + y.y) / 2 - b.y)
      oynadi.current = true
    } else if (p.length === 1) {
      if (Math.abs(e.clientX - b.x) > 6 || Math.abs(e.clientY - b.y) > 6) oynadi.current = true
      if (s.sc <= 1) return
      s.tx = b.tx + (e.clientX - b.x)
      s.ty = b.ty + (e.clientY - b.y)
    }
    sinirla()
    uygula()
  }

  function kalkti(e: PE) {
    if (!pts.current.delete(e.pointerId)) return
    if (pts.current.size === 0) {
      // Hareketsiz dokunuş ya da tam boya küçültmek: kapat
      if (!oynadi.current || d.current.sc <= 1.02) kapat()
      return
    }
    yeniBaslangic()
  }

  return createPortal(
    <div className="buyutec" ref={kat} role="dialog" aria-modal="true" aria-label={`${acik.baslik}, büyütülmüş`}
      onPointerDown={indi} onPointerMove={oynat} onPointerUp={kalkti} onPointerCancel={kalkti}>
      <div className="bar">
        <span>{acik.baslik}</span>
        {acik.sag && <span className="r">{acik.sag}</span>}
      </div>
      <img ref={res} src={acik.url} alt="" draggable={false} />
      <div className="alt">İki parmakla büyüt, dokunarak kapat.</div>
    </div>,
    document.body,
  )
}

/* Sayfadaki fotoğraf için tetik: iki parmak inince ya da çift dokununca açılır.
   Tek dokunuşu kaydırmaya bırakıyor (oylama ekranı dikey akıyor). Bir ekranda tek
   sayaç yetiyor: parmak kimlikleri benzersiz, 300ms içinde iki ayrı kareye dokunulmuyor. */
export function useBuyutecTetigi() {
  const parmak = useRef(new Set<number>())
  const son = useRef(0)
  const kalk = (e: PE) => { parmak.current.delete(e.pointerId) }
  return (ac: (olcek: number) => void) => ({
    onPointerDown(e: PE) {
      parmak.current.add(e.pointerId)
      if (parmak.current.size >= 2) { parmak.current.clear(); son.current = 0; ac(1.15); return }
      if (e.timeStamp - son.current < 300) { son.current = 0; ac(2.2); return }
      son.current = e.timeStamp
    },
    onPointerUp: kalk,
    onPointerCancel: kalk,
    onPointerLeave: kalk,
  })
}
