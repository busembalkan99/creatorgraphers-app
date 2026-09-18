/**
 * Sekme ekranlarının son verisi (Etkinlikler, Sıralama, Profil). Geri dönünce ekran
 * ilk karede tam boyuyla çiziliyor ve kaldığın yere boyanmadan önce kaydırılabiliyor;
 * yoksa önce boş açılıp veri gelince aşağı zıplıyordu (Buse, 2026-09-18). Veri arka
 * planda yine tazeleniyor. Anahtarlar üye kimliğini taşıyor, oturum değişince karışmıyor.
 */
const bellek = new Map<string, unknown>()

export const bellektenAl = <T,>(anahtar: string) => bellek.get(anahtar) as T | undefined
export const bellegeYaz = <T,>(anahtar: string, veri: T) => { bellek.set(anahtar, veri); return veri }
