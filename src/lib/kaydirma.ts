/**
 * Geri dönünce bırakılan yer korunuyor (Buse, 2026-09-18). Uygulamalardaki davranış:
 * birinin profilinden Sıralama'ya dönünce liste kaldığın yerde. Sekmeye dokununca ise
 * baştan açılıyor.
 */
const konum = new Map<string, number>()
let geriDonus = false

/** Çıkılan ekranın kaydırma yerini sakla. Ekran henüz değişmeden çağrılmalı. */
export function konumKaydet(yol: string) {
  const sc = document.querySelector('.sc')
  if (sc) konum.set(yol, sc.scrollTop)
}

/** Sıradaki geçiş bir geri hareketi: künyedeki geri bağlantısı ya da tarayıcının geri tuşu. */
export function geriDon() {
  geriDonus = true
}

/** Geri dönülüyorsa saklanan yer, değilse null. Bir kez okunur. */
export function geriAlinacak(yol: string): number | null {
  const g = geriDonus
  geriDonus = false
  return g ? konum.get(yol) ?? null : null
}
