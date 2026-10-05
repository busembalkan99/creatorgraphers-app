import type { Etkinlik } from '../../lib/tipler'
// Uzantıyla: dosya düğümde de test ediliyor (testler/wrapped-plan.mjs)
import { ayAdi } from '../../lib/zaman.ts'

/**
 * Wrapped kart planı (karar 126): hangi kartlar var, kişisel kart hangi durumda. Bütün setler aynı planı
 * çiziyor; set yalnız görünüşü ve sesi değiştiriyor. Kurallar eski Wrapped'den aynen (spec 2026-09-20,
 * kararlar 52, 111, 114). JSX yok: düğümde test ediliyor (testler/wrapped-plan.mjs).
 */

export type SK = {
  id: string; tema: string; tema_ad: string; tema_sira: number; dosya: string; genislik: number; yukseklik: number
  sahip: string; sahip_ad: string; benim: boolean; ortalama: number | null; oy_sayisi: number | null
  sira: number | null; sirali: boolean; cikarildi: boolean; cikarma_nedeni: string | null; url?: string | null
}
export type Ozet = { kisi: number; kare: number; puan: number; benim_oyum: number; izlendi: boolean }
export type Tema = { id: string; ad: string; sira: number }
// oylanan: kişinin puan verdiği karelerden seçilenler (yalnız Kontakt'ın "oy verdin" kartı için doluyor)
export type WrappedVeri = { e: Etkinlik; temalar: Tema[]; kareler: SK[]; ozet: Ozet; oylanan?: string[] }
export type Eylem = { sonuca: () => void; paylas: () => void; tekrar: () => void }
export type Baglam = { ay: string; yil: string; etkinlikAdi: string; yarisan: SK[]; temaKareleri: (t: string) => SK[] }

export type KisiselDurum =
  | { tur: 'birinci'; kare: SK; ikinci: SK | null; ortak: boolean; ikisi: boolean }
  | { tur: 'sirali'; kare: SK; ikinci: SK | null; kac: number }
  | { tur: 'oylanmamis'; kare: SK; ikinci: SK | null; n: number }
  | { tur: 'girmedi'; kare: SK; ikinci: SK | null; n: number }   // kare.ortalama null ise puansız
  | { tur: 'cikarildi'; kare: SK }
  | { tur: 'oyverdi'; adet: number; hepsi: boolean }
  | { tur: 'katilmadi' }

export type Plan =
  | { tur: 'acilis' }
  | { tur: 'tema'; tema: Tema; kazananlar: SK[]; tek: boolean; adet: number }
  | { tur: 'kursu'; tema: Tema; ilk: SK; kursu: SK[]; farklar: number[]; az: boolean; girdi: number }
  | { tur: 'temalar'; satirlar: { tema: Tema; adet: number; enYuksek: SK | undefined }[]; toplam: number }
  | { tur: 'kisisel'; durum: KisiselDurum }
  | { tur: 'kapanis' }

// Ortak birincilerin adları: tek yerde, src/lib/metin.ts (testler/metin.mjs)
export { adlarYaz } from '../../lib/metin.ts'

export function kartPlani({ e, temalar, kareler, ozet }: WrappedVeri): { baglam: Baglam; plan: Plan[] } {
  const ay = ayAdi(e.bulusma_gunu)
  const yil = e.bulusma_gunu.slice(0, 4)
  // Karar 116: ekstra etkinliğin açılışı kendini söylüyor
  const etkinlikAdi = e.serbest ? `Ekstra etkinlik · ${ay}` : `${ay} etkinliği`
  const yarisan = kareler.filter(k => !k.cikarildi)
  const temaKareleri = (t: string) => yarisan.filter(k => k.tema === t)
  const kazananlar = (t: string) => temaKareleri(t).filter(k => k.sirali && k.sira === 1)
  // Temayı kimse oylamamışsa kartı açılmıyor (sonuç ekranının kuralı)
  const oylanan = temalar.filter(t => kazananlar(t.id).length > 0)
  const plan: Plan[] = [{ tur: 'acilis' }]

  // Temanın birincisi, tema başına (karar 111)
  for (const t of oylanan) {
    const adet = temaKareleri(t.id).length
    plan.push({ tur: 'tema', tema: t, kazananlar: kazananlar(t.id), tek: adet === 1, adet })
  }

  // Kürsü: yalnız tek temalı etkinlikte
  if (temalar.length === 1 && oylanan.length === 1) {
    const t = oylanan[0]
    const ilk = kazananlar(t.id)[0]
    const kursu = temaKareleri(t.id).filter(k => k.sirali && (k.sira === 2 || k.sira === 3))
      .sort((a, b) => (a.sira ?? 9) - (b.sira ?? 9)).slice(0, 2)
    if (kursu.length > 0 && ilk.ortalama != null) {
      const farklar = kursu.map(k => ilk.ortalama! - (k.ortalama ?? 0))
      plan.push({ tur: 'kursu', tema: t, ilk, kursu, farklar, az: farklar.every(f => f <= 0.5),
        girdi: temaKareleri(t.id).filter(k => k.sirali).length })
    }
  }

  // Tema tema: yalnız iki temalı etkinlikte. Ortalama yerine en yüksek puan: temanın bütün ortalaması,
  // sıralamaya girmeyen kareler hakkında gizli olan bir şeyi söylerdi (karar 52).
  if (temalar.length === 2) {
    const satirlar = temalar.map(t => ({ tema: t, adet: temaKareleri(t.id).length, enYuksek: kazananlar(t.id)[0] }))
    plan.push({ tur: 'temalar', satirlar, toplam: satirlar.reduce((a, s) => a + s.adet, 0) })
  }

  plan.push({ tur: 'kisisel', durum: kisiselDurum(kareler, yarisan, ozet) })
  plan.push({ tur: 'kapanis' })
  return { baglam: { ay, yil, etkinlikAdi, yarisan, temaKareleri }, plan }
}

/** Kişinin kartı, altı durum (spec bölüm 5); sıra eski Wrapped'deki gibi A, B, C, F, D, E. */
function kisiselDurum(kareler: SK[], yarisan: SK[], ozet: Ozet): KisiselDurum {
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

  // A · Temayı kazandın
  const kazandi = sirali.find(k => k.sira === 1)
  if (kazandi) {
    const ortak = yarisan.filter(k => k.tema === kazandi.tema && k.sirali && k.sira === 1).length > 1
    const ikinci = ikinciOf(kazandi)
    const ikisi = !ortak && !!ikinci?.sirali && ikinci.sira === 1
      && !yarisan.some(k => k.tema === ikinci.tema && k.id !== ikinci.id && k.sirali && k.sira === 1)
    return { tur: 'birinci', kare: kazandi, ikinci, ortak, ikisi }
  }
  // B · Sıralamaya girdin (en iyisi; birden çok temada girdiyse sayısı)
  if (sirali.length) {
    const k = sirali[0]
    return { tur: 'sirali', kare: k, ikinci: ikinciOf(k), kac: new Set(sirali.map(x => x.tema)).size }
  }
  // C · Sıralamaya girmedi (puanı yalnız kendisine açık, karar 52) ya da tema hiç oylanmamış
  if (yarisanBenim.length) {
    const k = [...yarisanBenim].sort((a, b) => (b.ortalama ?? -1) - (a.ortalama ?? -1))[0]
    const n = yarisan.filter(x => x.tema === k.tema).length
    return { tur: temaDolu(k.tema) ? 'girmedi' : 'oylanmamis', kare: k, ikinci: ikinciOf(k), n }
  }
  // F · Karen yarışmadan çıkarıldı (başka kimse bu kartı görmez, karar 103)
  const cikan = benim.find(k => k.cikarildi)
  if (cikan) return { tur: 'cikarildi', kare: cikan }
  // D · Kare yok, oy var
  if (ozet.benim_oyum > 0) return { tur: 'oyverdi', adet: ozet.benim_oyum, hepsi: ozet.benim_oyum >= ozet.kare }
  // E · Hiç katılmadın (kulübe sonradan katılan da bunu görür)
  return { tur: 'katilmadi' }
}

/**
 * Kontakt baskının açılış şeridi: etkinlikten rastgele kareler, numarasız (Buse, 2026-10-05). Rastgele ama
 * etkinliğe bağlı: aynı etkinlikte her izleyişte aynı kareler. Çıkarılan kare yok.
 */
export function acilisKareleri(e: { id: string }, kareler: SK[], n = 3): SK[] {
  let t = 0
  for (const c of e.id) t = (t * 31 + c.charCodeAt(0)) >>> 0
  const puanla = (id: string) => { let h = t; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0; return h }
  return kareler.filter(k => !k.cikarildi).map(k => ({ k, p: puanla(k.id) })).sort((a, b) => a.p - b.p).slice(0, n).map(x => x.k)
}
