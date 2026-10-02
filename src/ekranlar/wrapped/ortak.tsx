import type { CSSProperties, ReactNode } from 'react'
import type { Eylem, SK, WrappedVeri } from './plan'

/** Bütün setlerin ortak bileşenleri (karar 126). Biçim yardımcıları bicim.ts'te. */

/** "Selin Arı" → iki satır: ad ve soyad kartta alt alta duruyor */
export function Ad({ ad, className }: { ad: string; className?: string }) {
  const [on, ...son] = ad.split(' ')
  return <span className={`w-ad ${className ?? ''}`}>{on}{son.length > 0 && <><br />{son.join(' ')}</>}</span>
}
export function Foto({ k, stil }: { k?: SK | null; stil?: CSSProperties }) {
  return k?.url ? <img src={k.url} alt="" draggable={false} style={stil} /> : <span className="bos-foto" />
}

/** Kilometre sayacı: sayıdan sıfıra on adım, CSS alttan yukarı çeviriyor (eski set) */
export function Rulo({ n, cls }: { n: number; cls: string }) {
  const d = Array.from({ length: 10 }, (_, i) => Math.round((n * (9 - i)) / 9))
  return <span className="sayi"><span className={`rulo ${cls}`}>{d.map((x, i) => <span key={i}>{x}</span>)}</span></span>
}

/** Yeni setlerin kapanış düğmeleri (metinler her sette aynı); stil setin CSS'inde (.k-dugmeler, .k-dg) */
export function Dugmeler({ eylem, paylas }: { eylem: Eylem; paylas: boolean }) {
  return (
    <div className="k-dugmeler">
      <button className="k-dg dolu" onClick={eylem.sonuca}>Sonuçlara geç</button>
      {/* Karar 108: yarışan karesi olmayana paylaşım kartı yok */}
      {paylas && <button className="k-dg" onClick={eylem.paylas}>Kartını paylaş</button>}
      <button className="w-tekrar" onClick={eylem.tekrar}>Tekrar izle</button>
    </div>
  )
}

export type Kart = { ad: string; sinif: string; kisi?: boolean; govde: ReactNode; sag: string }
/** Kütüphanedeki bir set: aynı kart planını kendi görünüşüyle çiziyor. `sinif` telefonun kabuğuna ekleniyor. */
export type SetTanimi = { ad: 'klasik' | 'kontakt' | 'pano'; sinif: string; kur: (v: WrappedVeri, eylem: Eylem) => Kart[] }
