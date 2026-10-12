// Canlı karttaki tema listesi (karar 129, yalnız masaüstü). Metinler taslak: Task 12'de ux-writing.
export type OyTema = { tema: string; toplam: number; puanladigim: number }

export function temaDurumu(asama: string, temaId: string, bulusmada: boolean, benim: Set<string>, oy: OyTema[] | null): { metin: string; tamam: boolean } {
  if (asama === 'yukleme') return benim.has(temaId) ? { metin: 'Kare verdin', tamam: true } : { metin: 'Henüz yok', tamam: false }
  if (asama === 'baslamadi') return { metin: bulusmada ? 'Buluşmada' : 'Serbest', tamam: false }
  if (asama === 'oylama') {
    const o = oy?.find(x => x.tema === temaId)
    if (!o) return { metin: '', tamam: false }
    // toplam kişinin kendi karesini saymıyor: temada yalnız onun karesi varsa oylanacak bir şey yok
    if (o.toplam === 0) return { metin: 'Oylanacak kare yok', tamam: true }
    if (o.puanladigim >= o.toplam) return { metin: 'Bitti', tamam: true }
    return { metin: `${o.puanladigim} / ${o.toplam} puanladın`, tamam: false }
  }
  return { metin: '', tamam: false }
}
