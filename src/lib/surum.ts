/**
 * Yeni sürüm (Buse, 2026-09-20: "sessizce kendiliğinden yenile").
 * Uygulama açık kalınca yayınlanan yeni sürümü hiç almıyordu; ana ekrana eklenmiş hâli
 * günlerce eski kodla çalışabiliyordu. Arada bir yayındaki index.html okunuyor, içindeki
 * betik adı açık olanınkinden farklıysa yeni sürüm var demek.
 *
 * Yenileme bir sonraki ekran geçişinde, fark ettirmeden. Ekran görünür olunca yenilemek
 * yüklemeyi yarıda keserdi: iPhone'da fotoğraf seçerken sayfa bir an arka plana geçiyor.
 */

const BETIK = /\/assets\/index-[^"']+\.js/

/** Yayındaki sayfanın betik adı açık olandan farklı mı. Ad bulunamazsa hayır (bozuk cevap). */
export function yeniSurumMu(html: string, acik: string | null): boolean {
  const yayinda = html.match(BETIK)?.[0] ?? null
  return !!acik && !!yayinda && yayinda !== acik
}

const acikBetik = () =>
  (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)
    ?.getAttribute('src')?.match(BETIK)?.[0] ?? null

let yeni = false

async function kontrol(getir: () => Promise<string>, acik: string | null) {
  if (yeni) return
  try {
    yeni = yeniSurumMu(await getir(), acik)
  } catch {
    // Bağlantı yoksa bir dahaki kontrolde
  }
}

export function surumIzle() {
  const getir = () => fetch(`${import.meta.env.BASE_URL}index.html?s=${Date.now()}`, { cache: 'no-store' }).then(r => r.text())
  const acik = acikBetik()
  // Geliştirmede betik adı yok; testler kontrolü elle tetikliyor
  if (import.meta.env.DEV) {
    const w = window as unknown as { __surum: (html: string, acik: string) => Promise<void> }
    w.__surum = (html, a) => kontrol(async () => html, a)
  } else {
    window.setInterval(() => kontrol(getir, acik), 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kontrol(getir, acik) })
  }
  // Yeni adres zaten yazılmış: yenileyince kişi gittiği ekranda, yeni sürümle açılıyor
  window.addEventListener('hashchange', () => { if (yeni) window.location.reload() })
}
