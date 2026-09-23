/**
 * Paylaşım kartı (karar 104): dört düzen, 1080x1920 tuvale çiziliyor. Seçim ekranındaki önizleme
 * ve indirilen/paylaşılan PNG aynı tuvalden çıkıyor, yani görülen birebir paylaşılan.
 * Ölçüler .superpowers/.../paylasim-duzen.html'deki P1-P4'ten birebir.
 * Metin (M2 + M4): kazanan "Temanın karesi", eşit birinci "Ortak birinci", sıralamaya giren tek
 * kelime sıra ("Üçüncü"), girmeyen "Galeride".
 */

export type Duzen = 'dev' | 'kontakt' | 'egik' | 'bilet'
export const DUZENLER: { ad: Duzen; baslik: string }[] = [
  { ad: 'dev', baslik: 'Dev puan' },
  { ad: 'kontakt', baslik: 'Kontakt' },
  { ad: 'egik', baslik: 'Eğik' },
  { ad: 'bilet', baslik: 'Bilet' },
]

export type KartVeri = {
  ay: string          // "Eylül"
  yil: string         // "2026"
  tema: string
  ad: string          // paylaşanın adı
  baslik: string      // "Temanın karesi" | "Ortak birinci" | "Üçüncü" | "Galeride"
  puan: string        // "8,4" ya da "—"
  alt: string         // "12 kişi puanladı" | "Puanı yalnız sen görüyorsun"
  sira: string        // "01" | "—"
  temaKare: number
  foto: HTMLImageElement | null
  serit: (HTMLImageElement | null)[]
  tohum: string       // barkodun deseni için
}

const W = 1080, H = 1920
const up = (s: string) => s.toLocaleUpperCase('tr-TR')

export async function fontlarHazir() {
  const f = ['400 100px Anton', '700 24px "Space Mono"', '400 24px "Space Mono"', 'italic 400 90px "Instrument Serif"', '400 90px "Instrument Serif"']
  await Promise.all(f.map(x => document.fonts.load(x).catch(() => [])))
}

/** Harf aralıklı metin: ctx.letterSpacing her tarayıcıda yok, harf harf çiziliyor */
function yaz(c: CanvasRenderingContext2D, t: string, x: number, y: number, aralik = 0, hiza: CanvasTextAlign = 'left') {
  if (!aralik) { c.textAlign = hiza; c.fillText(t, x, y); return }
  const gen = olc(c, t, aralik)
  let px = hiza === 'right' ? x - gen : hiza === 'center' ? x - gen / 2 : x
  c.textAlign = 'left'
  for (const h of t) { c.fillText(h, px, y); px += c.measureText(h).width + aralik }
}
function olc(c: CanvasRenderingContext2D, t: string, aralik = 0) {
  let w = 0
  for (const h of t) w += c.measureText(h).width + aralik
  return aralik ? w - aralik : c.measureText(t).width
}
/** Sığmazsa küçült: uzun tema adı ya da uzun isim taşmasın */
function sigdir(c: CanvasRenderingContext2D, t: string, font: (px: number) => string, px: number, maxW: number, aralik = 0) {
  let s = px
  c.font = font(s)
  while (s > 12 && olc(c, t, aralik * (s / px)) > maxW) { s -= 2; c.font = font(s) }
  return s
}
/** Kelimeleri satırlara böl, en çok `satir` satır; sığmazsa yazıyı küçült */
function satirla(c: CanvasRenderingContext2D, t: string, font: (px: number) => string, px: number, maxW: number, satir = 2) {
  let s = px
  for (;;) {
    c.font = font(s)
    const kelime = t.split(' ')
    const l: string[] = []
    let su = ''
    for (const k of kelime) {
      const d = su ? `${su} ${k}` : k
      if (c.measureText(d).width <= maxW || !su) su = d
      else { l.push(su); su = k }
    }
    if (su) l.push(su)
    if ((l.length <= satir && l.every(x => c.measureText(x).width <= maxW)) || s <= 20) return { satirlar: l, px: s }
    s -= 4
  }
}
/** Fotoğrafı kırpmadan kutuya sığdır; döndürür: çizilen yükseklik */
function resim(c: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, maxH: number, zemin: string) {
  if (!img || !img.naturalWidth) { c.fillStyle = '#3a3a3a'; c.fillRect(x, y, w, Math.round(w * 2 / 3)); return Math.round(w * 2 / 3) }
  const oran = img.naturalWidth / img.naturalHeight
  let dw = w, dh = w / oran
  if (dh > maxH) { dh = maxH; dw = maxH * oran }
  c.fillStyle = zemin
  c.fillRect(x, y, w, dh)
  c.drawImage(img, x + (w - dw) / 2, y, dw, dh)
  return dh
}
function kapla(c: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (!img || !img.naturalWidth) return
  const o = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / o, sh = h / o
  c.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

const ANTON = (px: number) => `400 ${px}px Anton, Impact, sans-serif`
const MONO = (px: number, k = 700) => `${k} ${px}px "Space Mono", monospace`
const SERIF = (px: number, italik = false) => `${italik ? 'italic ' : ''}400 ${px}px "Instrument Serif", serif`

// ------------------------------------------------ P1 · Dev sayı arkada
function dev(c: CanvasRenderingContext2D, v: KartVeri) {
  c.fillStyle = '#0D0D0E'; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#8A8A85'; c.font = MONO(24)
  yaz(c, 'CREATORGRAPHERS', 96, 112, 5.76)
  yaz(c, up(`${v.ay} ${v.yil}`), 984, 112, 5.76, 'right')
  c.fillStyle = '#EDEDEA'; c.fillRect(96, 150, 888, 10)
  // Dev puan fotoğrafın arkasından taşıyor
  c.fillStyle = '#B52D12'
  const devPx = sigdir(c, v.puan, ANTON, 820, 1260)
  c.font = ANTON(devPx)
  yaz(c, v.puan, -90, 250 + devPx * 0.86, -devPx * 0.06)
  // Fotoğraf, siyah paspartu ve gölge
  c.save()
  c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = 90; c.shadowOffsetY = 50
  c.fillStyle = '#000'
  const ih = v.foto?.naturalWidth ? Math.min(620, 852 / (v.foto.naturalWidth / v.foto.naturalHeight)) : 568
  c.fillRect(96, 640, 888, ih + 36)
  c.restore()
  resim(c, v.foto, 114, 658, 852, 620, '#000')
  // Başlık
  c.fillStyle = '#EDEDEA'
  const b = satirla(c, up(v.baslik), ANTON, 96, 888, 2)
  c.font = ANTON(b.px)
  b.satirlar.forEach((s, i) => yaz(c, s, 96, 1330 + b.px * 0.95 * (i + 1) - b.px * 0.12))
  // Künye
  c.fillStyle = '#8A8A85'
  const sol = up(`${v.ad} · ${v.tema}`)
  const kpx = sigdir(c, sol, x => MONO(x), 26, 560, 1.56)
  c.font = MONO(kpx); yaz(c, sol, 96, H - 150 - 12, 1.56)
  c.font = MONO(Math.min(26, sigdir(c, up(v.alt), x => MONO(x), 26, 320, 1.56)))
  yaz(c, up(v.alt), 984, H - 150 - 12, 1.56, 'right')
  c.fillStyle = '#55534f'; c.font = MONO(22)
  yaz(c, 'CREATORGRAPHERS.COM', 96, H - 70, 4.4)
  yaz(c, `${v.sira} / ${String(v.temaKare).padStart(2, '0')}`, 984, H - 70, 4.4, 'right')
}

// ------------------------------------------------ P2 · Dikey künye + kontakt şeridi
function kontakt(c: CanvasRenderingContext2D, v: KartVeri) {
  c.fillStyle = '#e9e6dc'; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  // Dikey başlık: aşağıdan yukarı okunuyor
  c.save()
  // Şeridin (üstü 1598) üstünde bitsin, prototipte de dikey künye şeride değmiyordu
  c.translate(44 + 104 * 0.82, H - 360)
  c.rotate(-Math.PI / 2)
  c.fillStyle = '#111'
  const dik = up(`${v.tema} · ${v.baslik}`)
  c.font = ANTON(sigdir(c, dik, ANTON, 104, 1400))
  yaz(c, dik, 0, 0)
  c.restore()
  // Fotoğraf: kalın çerçeve
  c.fillStyle = '#111'
  const ih = v.foto?.naturalWidth ? Math.min(560, 740 / (v.foto.naturalWidth / v.foto.naturalHeight)) : 493
  c.fillRect(220, 150, 788, ih + 48)
  resim(c, v.foto, 244, 174, 740, 560, '#111')
  // Üç satır veri
  const satirlar: [string, string][] = [['ORTALAMA', v.puan], ['SIRA', v.sira], ['PUANLAYAN', v.alt.match(/^\d+/)?.[0] ?? '—']]
  let y = Math.max(820, 150 + ih + 48 + 60)
  for (const [k, d] of satirlar) {
    c.fillStyle = '#111'; c.fillRect(220, y, 788, 4)
    c.font = MONO(26); yaz(c, k, 220, y + 18 + 60, 1.56)
    c.font = ANTON(80); yaz(c, d, 1008, y + 18 + 70, 0, 'right')
    y += 4 + 18 + 80 + 18
  }
  // Kontakt şeridi: yalnız afiş izni açık olanların kareleri (karar 41), eksikler boş kare
  const sy = H - 190 - 132, fw = (936 - 50) / 6
  for (let i = 0; i < 6; i++) {
    const x = 72 + i * (fw + 10)
    c.fillStyle = '#111'; c.fillRect(x, sy, fw, 132)
    const im = v.serit[i] ?? null
    if (im) kapla(c, im, x + 6, sy + 6, fw - 12, 120)
    else { c.fillStyle = '#26262a'; c.fillRect(x + 6, sy + 6, fw - 12, 120) }
  }
  c.fillStyle = '#6d6a63'; c.font = MONO(20)
  yaz(c, up(`${v.ay} etkinliğinin diğer kareleri`), 72, H - 140, 2.8)
  c.font = MONO(22)
  yaz(c, up(v.ad), 72, H - 70, 4.4)
  yaz(c, up(`Creatorgraphers · ${v.ay} ${v.yil}`), 1008, H - 70, 4.4, 'right')
}

// ------------------------------------------------ P3 · Diyagonal eksen
function egik(c: CanvasRenderingContext2D, v: KartVeri) {
  c.fillStyle = '#F0EEE9'; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  const aci = -6 * Math.PI / 180
  // Eğik çizgiler
  for (const y of [320, 1240]) {
    c.save(); c.translate(W / 2, y); c.rotate(aci)
    c.fillStyle = 'rgba(27,27,27,.18)'; c.fillRect(-900, -1, 1800, 2)
    c.restore()
  }
  // Başlık
  c.save(); c.translate(96, 150 + 46); c.rotate(aci)
  c.fillStyle = '#1b1b1b'
  const b = satirla(c, v.baslik, x => SERIF(x, true), 92, 820, 2)
  c.font = SERIF(b.px, true)
  b.satirlar.forEach((s, i) => yaz(c, s, 0, b.px * 0.8 + i * b.px))
  c.restore()
  // Beyaz baskı, eğik ve gölgeli
  const ih = v.foto?.naturalWidth ? Math.min(520, 736 / (v.foto.naturalWidth / v.foto.naturalHeight)) : 490
  const kh = ih + 22 + 90
  c.save(); c.translate(150 + 390, 420 + kh / 2); c.rotate(aci)
  c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = 70; c.shadowOffsetY = 40
  c.fillStyle = '#fff'; c.fillRect(-390, -kh / 2, 780, kh)
  c.shadowColor = 'transparent'
  resim(c, v.foto, -368, -kh / 2 + 22, 736, 520, '#f2f0ec')
  c.fillStyle = '#1b1b1b'
  const alt = `${v.tema} · ${v.ad}`
  c.font = SERIF(sigdir(c, alt, x => SERIF(x, true), 30, 700), true)
  yaz(c, alt, -366, kh / 2 - 26)
  c.restore()
  // Dev puan, turuncu
  c.save(); c.translate(W - 80, 1080 + 240); c.rotate(aci)
  c.fillStyle = '#ff5a36'; c.font = SERIF(300)
  yaz(c, v.puan, 0, 0, 0, 'right')
  c.restore()
  // Künye
  c.save(); c.translate(96, H - 250); c.rotate(aci)
  c.fillStyle = 'rgba(27,27,27,.7)'; c.font = MONO(26, 400)
  yaz(c, up(v.alt), 0, -50, 2.08)
  yaz(c, `${v.sira} / ${String(v.temaKare).padStart(2, '0')}`, 0, 0, 2.08)
  c.restore()
  c.fillStyle = 'rgba(27,27,27,.45)'; c.font = MONO(22, 400)
  yaz(c, 'CREATORGRAPHERS', 96, H - 70, 5.28)
  yaz(c, up(`${v.ay} ${v.yil}`), 984, H - 70, 5.28, 'right')
}

// ------------------------------------------------ P4 · Bilet koçanı
function bilet(c: CanvasRenderingContext2D, v: KartVeri) {
  const ZEMIN = '#1a1a1c', KAGIT = '#f3f0e8'
  c.fillStyle = ZEMIN; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  // Önce yükseklik: başlık + fotoğraf + fiş + barkod
  // Prototipteki gibi iki satır: üstte tema, altta başlık; her biri kendi genişliğine sığdırılıyor
  const bSat = [up(v.tema), up(v.baslik)]
  const bPx = Math.min(...bSat.map(t => sigdir(c, t, ANTON, 118, 768)))
  const hb = { satirlar: bSat, px: bPx }
  const ih = v.foto?.naturalWidth ? Math.min(520, 740 / (v.foto.naturalWidth / v.foto.naturalHeight)) : 493
  const icH = 56 + 44 + 34 + hb.satirlar.length * hb.px * 0.92 + 34 + ih + 28 + 30 + 3 + 22 + 2 * 55 + 100 + 46 + 70 + 64
  const bx = (W - 880) / 2, by = Math.max(60, (H - icH) / 2 - 30)
  c.fillStyle = KAGIT; c.fillRect(bx, by, 880, icH)
  // Delikli kenarlar
  c.fillStyle = ZEMIN
  for (let x = bx - 26 + 26; x < bx + 880 + 26; x += 52) {
    for (const y of [by, by + icH]) { c.beginPath(); c.arc(x, y, 26, 0, Math.PI * 2); c.fill() }
  }
  const x0 = bx + 56, x1 = bx + 880 - 56
  let y = by + 56
  c.fillStyle = '#1a1a1c'; c.font = MONO(24)
  yaz(c, 'CREATORGRAPHERS', x0, y + 24, 4.8)
  yaz(c, up(`${v.ay} ${v.yil}`), x1, y + 24, 4.8, 'right')
  y += 44; c.fillRect(x0, y, 768, 4)
  y += 34
  c.font = ANTON(hb.px)
  for (const s of hb.satirlar) { y += hb.px * 0.92; yaz(c, s, x0, y) }
  y += 34
  c.fillStyle = '#1a1a1c'; c.fillRect(x0, y, 768, ih + 28)
  resim(c, v.foto, x0 + 14, y + 14, 740, 520, '#1a1a1c')
  y += ih + 28 + 30
  // Kesik çizgi
  c.fillStyle = 'rgba(26,26,28,.45)'
  for (let x = x0; x < x1; x += 18) c.fillRect(x, y, 10, 3)
  y += 3 + 22
  const fis: [string, string, boolean][] = [['FOTOĞRAFÇI', v.ad, false], ['PUANLAYAN', v.alt.match(/^\d+/) ? `${v.alt.match(/^\d+/)![0]} kişi` : 'Yalnız sende', false], ['ORTALAMA', v.puan, true]]
  c.fillStyle = '#1a1a1c'
  for (const [k, d, buyuk] of fis) {
    // Büyük ortalama 90px: üstündeki satıra binmesin diye kendi yüksekliği kadar yer
    y += buyuk ? 100 : 55
    c.font = MONO(26); yaz(c, k, x0, y, 1.04)
    if (buyuk) { c.font = ANTON(90); yaz(c, d, x1, y + 12, 0, 'right') }
    else { c.font = MONO(sigdir(c, up(d), x => MONO(x), 26, 480, 1.04)); yaz(c, up(d), x1, y, 1.04, 'right') }
  }
  y += 26 + 34
  // Barkod: karenin kimliğinden, her kartta farklı ama aynı karede hep aynı
  let t = 0
  for (const h of v.tohum) t = (t * 31 + h.charCodeAt(0)) >>> 0
  const cubuk = 15, gap = 5, cw = (768 - gap * (cubuk - 1)) / cubuk
  for (let i = 0; i < cubuk; i++) {
    t = (t * 1103515245 + 12345) >>> 0
    const h = 24 + (t % 47)
    c.fillRect(x0 + i * (cw + gap), y + 70 - h, cw, h)
  }
  c.fillStyle = '#7c7a72'; c.font = MONO(22)
  yaz(c, 'CREATORGRAPHERS.COM', bx + 8, by + icH + 96, 4.4)
  yaz(c, `${v.sira} / ${String(v.temaKare).padStart(2, '0')}`, bx + 880 - 8, by + icH + 96, 4.4, 'right')
}

const CIZ: Record<Duzen, (c: CanvasRenderingContext2D, v: KartVeri) => void> = { dev, kontakt, egik, bilet }

export function kartCiz(duzen: Duzen, v: KartVeri): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  CIZ[duzen](c, v)
  return cv
}

/** Kişinin paylaşacağı karenin başlığı (M2 + M4) */
const SIRA = ['', 'Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci']
export function kartBasligi(sira: number | null, sirali: boolean, ortak: boolean) {
  if (!sirali || sira == null) return 'Galeride'
  if (sira === 1) return ortak ? 'Ortak birinci' : 'Temanın karesi'
  return SIRA[sira] ?? `${sira}.`
}
