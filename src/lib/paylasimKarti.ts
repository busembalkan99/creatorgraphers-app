/**
 * Paylaşım kartı (karar 104, 130): yedi düzen, 1080x1920 tuvale çiziliyor. Seçim ekranındaki önizleme
 * ve indirilen/paylaşılan PNG aynı tuvalden çıkıyor, yani görülen birebir paylaşılan.
 * Ölçüler .superpowers/.../paylasim-duzen.html'deki P1-P4'ten birebir; Lüp, Baskı ve Kontakt sayfası (Kontakt dili,
 * karar 130) brainstorm'daki paylasim-haller-v1 maketinden (uret-paylasim.mjs A, B, C').
 * Metin (M2 + M4): kazanan "Tema birincisi" (karar 111), eşit birinci "Ortak birinci", sıralamaya giren tek
 * kelime sıra ("Üçüncü"), girmeyen "Galeride".
 */

import { izgaraKareleri } from '../ekranlar/wrapped/plan.ts'
import { baskiOlcu } from '../ekranlar/wrapped/bicim.ts'

export type Duzen = 'dev' | 'kontakt' | 'egik' | 'bilet' | 'lup' | 'baski' | 'sayfa'
export const DUZENLER: { ad: Duzen; baslik: string }[] = [
  { ad: 'dev', baslik: 'Dev puan' },
  { ad: 'kontakt', baslik: 'Kontakt' },
  { ad: 'egik', baslik: 'Eğik' },
  { ad: 'bilet', baslik: 'Bilet' },
  { ad: 'lup', baslik: 'Lüp' },
  { ad: 'baski', baslik: 'Baskı' },
  { ad: 'sayfa', baslik: 'Kontakt sayfası' },
]

/** Ölçüm kutusu (testler/paylasim-kart.mjs): çizilen yazının mürekkebi ya da görselin tuvaldeki yeri; senin karen yüklenemediyse boş çerçeve t: 'bos' */
export type Kutu = {
  tur: 'yazi' | 'kalem' | 'foto' | 'serit' | 'lup' | 'baslik' | 'daire'
  x: number; y: number; w: number; h: number; t?: string; kaynak?: 'foto' | 'serit'
  g?: number   // yazının ilerleme genişliği: WebKit mürekkebin yatay sınırını vermiyor, motorlar bununla karşılaştırılıyor
}

export type KartVeri = {
  ay: string          // "Eylül"
  yil: string         // "2026"
  tema: string
  ad: string          // paylaşanın adı
  baslik: string      // "Tema birincisi" | "Ortak birinci" | "Üçüncü" | "Galeride"
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
  // Türkçe harfler ayrı alt kümede (latin-ext); örnek metin verilmezse tuval o harfleri yedek yazıyla çiziyor
  const k = ['900 200px Archivo', '700 30px Archivo', '400 96px Mansalva']
  await Promise.all([
    ...f.map(x => document.fonts.load(x).catch(() => [])),
    ...k.map(x => document.fonts.load(x, ORNEK).catch(() => [])),
    darYukle(),
  ])
}
const ORNEK = 'AZaz09İĞŞÇÖÜığşçöü'

/**
 * Dar Archivo kesimleri (wdth 62,5 ve 75) kendi aile adlarıyla: WebKit tuvalinde fontStretch yok, değişken yazının
 * genişliği orada seçilemiyor. Google'ın tek değer istenen CSS'i genişliği sabitlenmiş dosyalar veriyor; alt kümeler
 * (latin, latin-ext) unicode-range'leriyle ekleniyor. Yüklenemezse ya da 4 sn'de gelmezse fontStretch yolu kalıyor.
 */
const DAR = [['ArchivoDar', '62.5', '900'], ['ArchivoDar75', '75', '700']] as const
let DAR_VAR = false
let darSoz: Promise<boolean> | null = null
// Yavaş ya da takılan bağlantıda paylaşım ekranı beklemesin: süre dolunca fontStretch yolu
const DAR_SURE = 4000
async function darYukle() {
  darSoz ??= darDene()
  DAR_VAR = await darSoz
}
function darDene(): Promise<boolean> {
  const eklenen: FontFace[] = [], iptal = new AbortController()
  const dene = (async () => {
    try {
      for (const [aile, wdth, k] of DAR) {
        const r = await fetch(`https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@${wdth},${k}&display=swap`, { signal: iptal.signal })
        if (!r.ok) return false
        for (const [, b] of (await r.text()).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
          const src = /src:\s*(url\([^)]+\))/.exec(b)?.[1], ur = /unicode-range:\s*([^;]+);/.exec(b)?.[1]
          if (!src || iptal.signal.aborted) continue
          const y = new FontFace(aile, src, { weight: k, ...(ur && { unicodeRange: ur.trim() }) })
          document.fonts.add(y); eklenen.push(y)
        }
        const l = await document.fonts.load(`${k} 100px "${aile}"`, ORNEK)
        if (!l.length || l.some(x => x.status !== 'loaded')) return false
      }
      return !iptal.signal.aborted
    } catch { return false }
  })()
  let sayac = 0
  const sure = new Promise<boolean>(r => { sayac = window.setTimeout(() => r(false), DAR_SURE) })
  const soz: Promise<boolean> = Promise.race([dene, sure]).then(ok => {
    clearTimeout(sayac)
    if (!ok) {
      // Başarısız ya da süresi doldu: bu denemenin yüzleri (geç yüklenseler de) siliniyor, bir sonraki çağrı yeniden deniyor
      iptal.abort()
      if (darSoz === soz) darSoz = null
      void dene.then(() => { for (const y of eklenen) document.fonts.delete(y) })
    }
    return ok
  })
  return soz
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
/** Kelimeleri satırlara böl, en çok `satir` satır; sığmazsa yazıyı küçült. `aralik`: harf aralığı, yazı boyunun oranı */
function satirla(c: CanvasRenderingContext2D, t: string, font: (px: number) => string, px: number, maxW: number, satir = 2, aralik = 0) {
  let s = px
  for (;;) {
    c.font = font(s)
    const g = (x: string) => olc(c, x, aralik * s)
    const kelime = t.split(' ')
    const l: string[] = []
    let su = ''
    for (const k of kelime) {
      const d = su ? `${su} ${k}` : k
      if (g(d) <= maxW || !su) su = d
      else { l.push(su); su = k }
    }
    if (su) l.push(su)
    if ((l.length <= satir && l.every(x => g(x) <= maxW)) || s <= 20) return { satirlar: l, px: s }
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
  const sag = up(`Creatorgraphers · ${v.ay} ${v.yil}`)
  const sagW = olc(c, sag, 4.4)
  // Uzun isim sağdaki künyeye değmesin: sığmazsa küçült (karar 130'daki canlı hata)
  const adPx = sigdir(c, up(v.ad), x => MONO(x), 22, 936 - sagW - 40, 4.4)
  c.font = MONO(adPx)
  yazK(c, up(v.ad), 72, H - 70, 4.4 * adPx / 22)
  c.font = MONO(22)
  yazK(c, sag, 1008, H - 70, 4.4, 'right')
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

// ------------------------------------------------ Kontakt dili (karar 130): Lüp, Baskı, Kontakt sayfası
// Dar biçim önce sabit genişlikli kesimden (darYukle); o yüklenemediyse fontStretch (yazı tanımındaki "extra-condensed"),
// o da yoksa (WebKit) yazı geniş kalıyor ve sigdir/satirla küçülterek sığdırıyor.
const ARCH = (px: number) => (DAR_VAR ? `900 ${px}px "ArchivoDar", Archivo, sans-serif` : `900 extra-condensed ${px}px Archivo, sans-serif`)
const AK = (px: number) => (DAR_VAR ? `700 ${px}px "ArchivoDar75", Archivo, sans-serif` : `700 condensed ${px}px Archivo, sans-serif`)
const KALEM = (px: number) => `400 ${px}px Mansalva, cursive`
const KALEM_R = '#b52d12', KAGIT = '#efeae0', SOLUK = '#6d655b', MUREKKEP = '#141210', FILM = '#161412', BOS = '#24201c', LUP = '#232020'
const DAIRE_FOTO = 'M26 104 C 18 30, 274 14, 286 92 C 296 166, 72 198, 30 132 C 16 108, 58 60, 124 52'
const DAIRE_YAZI = 'M60 40 C 130 6, 252 10, 286 80 C 302 150, 204 194, 120 188 C 40 182, 2 132, 14 92 C 22 58, 62 30, 116 20'

let OLC: Kutu[] | null = null

/** Yerel dikdörtgeni o anki dönüşümle tuvale çevirip ölçüme yazar. Görseller tuvalle kırpılıyor: şerit kenardan taşarak çiziliyor. */
function kutu(c: CanvasRenderingContext2D, tur: Kutu['tur'], x0: number, y0: number, x1: number, y1: number, t?: string, kaynak?: Kutu['kaynak'], g?: number) {
  if (!OLC) return
  const m = c.getTransform()
  const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
  kutuYaz(tur, Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1])), t, kaynak, g)
}
function kutuYaz(tur: Kutu['tur'], x0: number, y0: number, x1: number, y1: number, t?: string, kaynak?: Kutu['kaynak'], g?: number) {
  if (tur === 'foto' || tur === 'serit' || tur === 'lup') {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
    if (x1 <= x0 || y1 <= y0) return
  }
  OLC?.push({ tur, x: x0, y: y0, w: x1 - x0, h: y1 - y0, ...(t != null && { t }), ...(kaynak && { kaynak }), ...(g != null && { g }) })
}
/** Lüpün dairesi ve eğik sapı tek dikdörtgene sığmıyor (köşeler boş): dışbükey şekil 8px'lik yatay dilimlerle ölçülüyor */
function sekilKutu(c: CanvasRenderingContext2D, tur: Kutu['tur'], nokta: [number, number][]) {
  if (!OLC) return
  const m = c.getTransform()
  const p = nokta.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
  const ys = p.map(q => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys)
  for (let a = y0; a < y1; a += 8) {
    const b = Math.min(y1, a + 8), xs: number[] = []
    p.forEach((q, i) => {
      const r = p[(i + 1) % p.length]
      if (q[1] >= a && q[1] <= b) xs.push(q[0])
      for (const s of [a, b]) if ((q[1] - s) * (r[1] - s) < 0) xs.push(q[0] + (s - q[1]) / (r[1] - q[1]) * (r[0] - q[0]))
    })
    if (xs.length) kutuYaz(tur, Math.min(...xs), a, Math.max(...xs), b)
  }
}
/** Dairenin dışına çizilmiş çokgen (yarıçap 1/cos(π/n) büyütülmüş, ölçüm şekli hiç kesmesin) */
function cember(cx: number, cy: number, r: number, bas = 0, son = Math.PI * 2, n = 64): [number, number][] {
  const R = r / Math.cos(Math.PI / n), l: [number, number][] = []
  for (let i = 0; i <= n * (son - bas) / (Math.PI * 2); i++) { const a = bas + i * Math.PI * 2 / n; l.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]) }
  return l
}
/** Harf aralıklı yazı + ölçüm kutusu */
function yazK(c: CanvasRenderingContext2D, t: string, x: number, y: number, aralik = 0, hiza: CanvasTextAlign = 'left', tur: Kutu['tur'] = 'yazi') {
  yaz(c, t, x, y, aralik, hiza)
  const gen = olc(c, t, aralik), x0 = hiza === 'right' ? x - gen : hiza === 'center' ? x - gen / 2 : x
  const m = c.measureText(t)
  kutu(c, tur, x0, y - m.actualBoundingBoxAscent, x0 + gen, y + m.actualBoundingBoxDescent, t, undefined, gen)
  return gen
}
/** Sol hizalı tek satırın mürekkep kutusu */
function murekkep(c: CanvasRenderingContext2D, tur: Kutu['tur'], t: string, x: number, y: number) {
  const m = c.measureText(t)
  kutu(c, tur, x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent, x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent, t, undefined, m.width)
}
/** Çok satırlı yazı tek kutu: satırların mürekkebi döndürülmüş blokta birbirine değebiliyor, bu çakışma değil */
function blok(cizim: () => void) {
  const once = OLC?.length ?? 0
  cizim()
  const k = OLC?.splice(once) ?? []
  if (!k.length) return
  const x0 = Math.min(...k.map(q => q.x)), y0 = Math.min(...k.map(q => q.y))
  const x1 = Math.max(...k.map(q => q.x + q.w)), y1 = Math.max(...k.map(q => q.y + q.h))
  OLC?.push({ tur: k[0].tur, x: x0, y: y0, w: x1 - x0, h: y1 - y0, t: k.map(q => q.t).join(' / '), g: Math.max(...k.map(q => q.g ?? 0)) })
}
/** CSS satır kutusunun üstünden taban çizgisine uzaklık (yarım satır aralığı + yazının üst payı) */
function taban(c: CanvasRenderingContext2D, satirH?: number) {
  const m = c.measureText('H')
  const a = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent, d = m.fontBoundingBoxDescent ?? 0
  return { y: ((satirH ?? a + d) - (a + d)) / 2 + a, a, d }
}
/** Maketteki .AK: büyük harf, harf aralığı .12em, satır yüksekliği normal; sığmazsa küçülüyor. Dönüş: çizilen genişlik */
function akYaz(c: CanvasRenderingContext2D, t: string, x: number, y: number, px: number, maxW: number, hiza: CanvasTextAlign = 'left', alttan = false) {
  const u = up(t)
  const s = sigdir(c, u, AK, px, maxW, px * 0.12)
  c.font = AK(s)
  const b = taban(c)
  return yazK(c, u, x, alttan ? y - b.d : y + b.a, s * 0.12, hiza)
}
/** Maketteki .A başlık, satır yüksekliği 1,08 */
function baslikYaz(c: CanvasRenderingContext2D, t: string, x: number, ust: number, px: number, maxW: number, renk: string, satir = 2) {
  const b = satirla(c, up(t), ARCH, px, maxW, satir)
  c.font = ARCH(b.px); c.fillStyle = renk; c.textAlign = 'left'
  const L = b.px * 1.08, tb = taban(c, L).y
  b.satirlar.forEach((s, i) => { c.fillText(s, x, ust + i * L + tb); murekkep(c, 'baslik', s, x, ust + i * L + tb) })
  return { n: b.satirlar.length, L }
}
/** Kalem yazısı: CSS'teki gibi sol üstü (x, ust), genişliği kutuW olan blok, merkezinden `aci` derece dönüyor */
function kalemBlok(c: CanvasRenderingContext2D, satirlar: string[], px: number, lh: number, x: number, ust: number, kutuW: number, aci: number, renk: string) {
  c.font = KALEM(px)
  const L = px * lh, kh = satirlar.length * L, tb = taban(c, L).y
  c.save(); c.translate(x + kutuW / 2, ust + kh / 2); c.rotate(aci * Math.PI / 180)
  c.fillStyle = renk; c.textAlign = 'left'
  blok(() => satirlar.forEach((s, i) => { const y = -kh / 2 + i * L + tb; c.fillText(s, -kutuW / 2, y); murekkep(c, 'kalem', s, -kutuW / 2, y) }))
  c.restore()
  return kh
}
function daireCiz(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tur: 'foto' | 'yazi') {
  const p = new Path2D(tur === 'foto' ? DAIRE_FOTO : DAIRE_YAZI)
  // Maketteki SVG gibi (viewBox 300x200, preserveAspectRatio none): çizgi kalınlığı da kutuyla esniyor
  c.save(); c.translate(x, y); c.scale(w / 300, h / 200)
  c.strokeStyle = KALEM_R; c.lineWidth = 14; c.lineCap = 'round'; c.stroke(p)
  kutu(c, 'daire', 0, 0, 300, 200, 'daire')
  c.restore()
}
/** Başkalarının kareleri gri. ctx.filter WebKit'te yok: orada renk doygunluğu düz griyle siliniyor. */
function griCiz(c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, saydam = 1) {
  const filtre = typeof (c as { filter?: unknown }).filter === 'string'
  c.save(); c.globalAlpha = saydam
  if (filtre) c.filter = 'grayscale(1) contrast(1.06)'
  kapla(c, img, x, y, w, h)
  c.restore()
  if (!filtre) { c.save(); c.globalCompositeOperation = 'saturation'; c.fillStyle = '#808080'; c.fillRect(x, y, w, h); c.restore() }
}
const digerleri = (v: KartVeri) => v.serit.filter((x): x is HTMLImageElement => !!x?.naturalWidth)

function kunyeUst(c: CanvasRenderingContext2D, v: KartVeri, renk: string) {
  c.fillStyle = renk
  akYaz(c, 'Creatorgraphers', 80, 90, 30, 440)
  akYaz(c, `${v.ay} ${v.yil}`, 1000, 90, 30, 400, 'right')
}
function kunyeAlt(c: CanvasRenderingContext2D, v: KartVeri, renk: string) {
  c.fillStyle = renk
  const sagW = akYaz(c, 'creatorgraphers.com', 1000, H - 90, 30, 440, 'right', true)
  akYaz(c, v.alt, 80, H - 90, 30, Math.min(560, 920 - sagW - 40), 'left', true)
}

// ------------------------------------------------ A · Lüp: gri şerit, lüpte senin karen renkli
function lup(c: CanvasRenderingContext2D, v: KartVeri) {
  c.fillStyle = KAGIT; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  kunyeUst(c, v, SOLUK)
  akYaz(c, `${v.tema} · ${v.ay} etkinliği`, 80, 220, 34, 920)
  const b = baslikYaz(c, v.baslik, 80, 270, 200, 920, MUREKKEP)
  // Tek satırlı başlıkta blok yukarı geliyor
  const kay = 270 + b.n * b.L - 702
  const sx = -260, sy = 940 + kay, sw = 28 * 2 + 4 * 420 + 3 * 24
  c.fillStyle = FILM; c.fillRect(sx, sy, sw, 408)
  kutu(c, 'serit', sx, sy, sx + sw, sy + 408)
  c.fillStyle = KAGIT
  for (let x = sx + 19; x < sx + sw; x += 52) for (const y of [sy + 18, sy + 368]) c.fillRect(x, y, Math.min(16, sx + sw - x), 22)
  const d = digerleri(v)
  ;[d[0] ?? null, 'sen' as const, d[1] ?? null, d[2] ?? null].forEach((k, i) => {
    const x = sx + 28 + i * 444, y = sy + 64, img = k === 'sen' ? v.foto : k
    if (x >= W) return
    if (!img?.naturalWidth) { c.fillStyle = BOS; c.fillRect(x, y, 420, 280); return }
    griCiz(c, img, x, y, 420, 280)
    kutu(c, 'foto', x, y, x + 420, y + 280, undefined, k === 'sen' ? 'foto' : 'serit')
  })
  // Lüp: koyu çerçeve ve gölge, içinde senin karen renkli ve büyütülmüş
  const cx = 590, cy = 1110 + kay
  c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 90; c.shadowOffsetY = 40
  c.fillStyle = LUP; c.beginPath(); c.arc(cx, cy, 320, 0, Math.PI * 2); c.fill()
  c.restore()
  c.save(); c.beginPath(); c.arc(cx, cy, 284, 0, Math.PI * 2); c.clip()
  c.fillStyle = BOS; c.fill()
  if (v.foto?.naturalWidth) { kapla(c, v.foto, 126, 800 + kay, 940, 627); kutu(c, 'foto', cx - 284, cy - 284, cx + 284, cy + 284, undefined, 'foto') }
  else kutu(c, 'foto', cx - 284, cy - 284, cx + 284, cy + 284, 'bos', 'foto')
  c.restore()
  sekilKutu(c, 'lup', cember(cx, cy, 320))
  c.save(); c.translate(910, 1481 + kay); c.rotate(42 * Math.PI / 180)
  c.strokeStyle = LUP; c.lineWidth = 66; c.lineCap = 'round'
  c.beginPath(); c.moveTo(-97, 0); c.lineTo(97, 0); c.stroke()
  sekilKutu(c, 'lup', [...cember(97, 0, 33, -Math.PI / 2, Math.PI / 2, 32), ...cember(-97, 0, 33, Math.PI / 2, Math.PI * 1.5, 32)])
  c.restore()
  // Kalem: sıra (Galeride yok, karar 52), isim ve puan
  if (v.sira !== '—') {
    const n = String(Number(v.sira))
    c.font = KALEM(210)
    const w = c.measureText(n).width
    // Maketten 16px sağda ve yukarıda (sağ kenar payı 80): "2" ve "3" lüpün kenarına 16px'ten fazla yaklaşıyordu
    kalemBlok(c, [n], 210, 1, 1000 - w, 690 + kay, w, 8, KALEM_R)
  }
  const isim = satirla(c, `${v.ad} ${v.puan}`, KALEM, 88, 900, 2)
  kalemBlok(c, isim.satirlar, isim.px, 1.05, 80, 1550 + kay, 900, -2, KALEM_R)
  kunyeAlt(c, v, SOLUK)
}

// ------------------------------------------------ B · Baskı: masaya konmuş baskı, puan alt payda kalemle
function baski(c: CanvasRenderingContext2D, v: KartVeri) {
  c.fillStyle = KAGIT; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  kunyeUst(c, v, SOLUK)
  // Baskı fotoğrafın kendi oranında: yatay 880 genişlik, dikey 900 yükseklik
  const { w, h } = baskiOlcu({ genislik: v.foto?.naturalWidth ?? 0, yukseklik: v.foto?.naturalHeight ?? 0 }, 880, 900)
  const baskiH = 26 + h + 230, toplam = baskiH + 70 + 162 + 30 + 160
  const ust0 = Math.max(170, Math.round((H - 180 - toplam) / 2) + 60)
  const sol = Math.round((W - (w + 52)) / 2)
  c.save(); c.translate(sol + (w + 52) / 2, ust0 + baskiH / 2); c.rotate(-3 * Math.PI / 180)
  const X = -(w + 52) / 2, Y = -baskiH / 2
  c.save(); c.shadowColor = 'rgba(20,18,16,.28)'; c.shadowBlur = 70; c.shadowOffsetY = 30
  c.fillStyle = '#fbf8f1'; c.fillRect(X, Y, w + 52, baskiH)
  c.restore()
  if (v.foto?.naturalWidth) { kapla(c, v.foto, X + 26, Y + 26, w, h); kutu(c, 'foto', X + 26, Y + 26, X + 26 + w, Y + 26 + h, undefined, 'foto') }
  else { c.fillStyle = '#3a3a3a'; c.fillRect(X + 26, Y + 26, w, h); kutu(c, 'foto', X + 26, Y + 26, X + 26 + w, Y + 26 + h, 'bos', 'foto') }
  // Alt payda solda tema, ay, sıra
  c.fillStyle = SOLUK
  const tema = satirla(c, up(v.tema), AK, 26, w - 360, 2, 0.12)
  const satirlar = [...tema.satirlar.map(t => [t, tema.px] as const), [up(`${v.ay} ${v.yil}`), 26] as const, ...(v.sira !== '—' ? [[v.sira, 26] as const] : [])]
  let y = Y + 26 + h + 40
  blok(() => {
    for (const [t, px] of satirlar) {
      c.font = AK(px)
      const b = taban(c)
      yazK(c, t, X + 30, y + b.a, px * 0.12)
      y += b.a + b.d
    }
  })
  // Sağda puan, sıraya girdiyse daire içinde (Galeride daire yok, karar 52)
  c.font = KALEM(124)
  const bw = c.measureText(v.puan).width + 148, bh = 124 * 1.15 + 64
  const bx = X + 26 + w - 20 - bw, by = Y + 26 + h + 4
  c.save(); c.translate(bx + bw / 2, by + bh / 2); c.rotate(-4 * Math.PI / 180)
  c.fillStyle = KALEM_R; c.textAlign = 'left'
  const ty = -bh / 2 + 34 + taban(c, 124 * 1.15).y
  c.fillText(v.puan, -bw / 2 + 74, ty); murekkep(c, 'kalem', v.puan, -bw / 2 + 74, ty)
  if (v.sira !== '—') daireCiz(c, -bw / 2, -bh / 2, bw, bh, 'yazi')
  c.restore()
  c.restore()
  const baslikUst = ust0 + baskiH + 70
  const b = baslikYaz(c, v.baslik, 80, baslikUst, 150, 920, MUREKKEP, 1)
  const isim = satirla(c, v.ad, KALEM, 72, 920, 2)
  kalemBlok(c, isim.satirlar, isim.px, 1.05, 80, baslikUst + b.L + 30, 920, -2, KALEM_R)
  kunyeAlt(c, v, SOLUK)
}

// ------------------------------------------------ C' · Kontakt sayfası: koyu sayfa, senin karen 2x2 ve kalemle işaretli
function sayfa(c: CanvasRenderingContext2D, v: KartVeri) {
  const ALTIN = '#e3a13b'
  c.fillStyle = FILM; c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  kunyeUst(c, v, ALTIN)
  const b = baslikYaz(c, v.baslik, 80, 170, 190, 920, KAGIT)
  const baslikAlt = 170 + b.n * b.L
  // Izgara hep tam dolsun diye senin karenin yanına 5 ya da 2 kare (az kare varsa olduğu kadar); satır yüksekliği sabit
  const o = digerleri(v).slice(0, izgaraKareleri(digerleri(v).length))
  const satir = Math.max(2, Math.ceil((4 + o.length) / 3)), izgaraH = satir * 204 + (satir - 1) * 22
  const isim = satirla(c, `${v.ad} ${v.puan}`, KALEM, 96, 920, 2)
  const blokH = izgaraH + 70 + 50 + isim.satirlar.length * isim.px * 1.05
  const ust0 = baslikAlt + Math.max(50, Math.round((H - 170 - baslikAlt - blokH) / 2))
  const sw = (960 - 44) / 3, hx = (s: number) => 60 + s * (sw + 22), hy = (r: number) => ust0 + r * 226
  const senW = 2 * sw + 22, senH = 2 * 204 + 22
  if (v.foto?.naturalWidth) { kapla(c, v.foto, 60, ust0, senW, senH); kutu(c, 'foto', 60, ust0, 60 + senW, ust0 + senH, undefined, 'foto') }
  else { c.fillStyle = '#3a3a3a'; c.fillRect(60, ust0, senW, senH); kutu(c, 'foto', 60, ust0, 60 + senW, ust0 + senH, 'bos', 'foto') }
  const hucre = Array.from({ length: satir * 3 }, (_, i) => i).filter(i => !(i % 3 < 2 && i < 6))
  hucre.forEach((i, j) => {
    const x = hx(i % 3), y = hy(Math.floor(i / 3)), img = o[j]
    if (img) { griCiz(c, img, x, y, sw, 204, 0.75); kutu(c, 'foto', x, y, x + sw, y + 204, undefined, 'serit') }
    else { c.fillStyle = BOS; c.fillRect(x, y, sw, 204) }
  })
  if (v.sira !== '—') daireCiz(c, 60 - 34, ust0 - 34, senW + 68, senH + 68, 'foto')
  c.fillStyle = ALTIN
  akYaz(c, `▸ ${v.sira !== '—' ? `${v.sira} · ` : ''}${v.tema} · ${v.temaKare} kare arasından`, 80, ust0 + izgaraH + 70, 26, 920)
  kalemBlok(c, isim.satirlar, isim.px, 1.05, 80, ust0 + izgaraH + 140, 920, -2, '#e0563a')
  kunyeAlt(c, v, ALTIN)
}

const CIZ: Record<Duzen, (c: CanvasRenderingContext2D, v: KartVeri) => void> = { dev, kontakt, egik, bilet, lup, baski, sayfa }

/** `olcum` verilirse yeni düzenlerin (ve kontakt'ın alt satırının) yazı ve görsel kutuları içine ekleniyor */
export function kartCiz(duzen: Duzen, v: KartVeri, olcum?: Kutu[]): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  OLC = olcum ?? null
  try { CIZ[duzen](c, v) } finally { OLC = null }
  return cv
}

/** Kişinin paylaşacağı karenin başlığı (M2 + M4) */
const SIRA = ['', 'Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci']
export function kartBasligi(sira: number | null, sirali: boolean, ortak: boolean) {
  if (!sirali || sira == null) return 'Galeride'
  if (sira === 1) return ortak ? 'Ortak birinci' : 'Tema birincisi'
  return SIRA[sira] ?? `${sira}.`
}
