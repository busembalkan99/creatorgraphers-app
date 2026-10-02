/** Kalkış tabelası metinleri (karar 126). JSX yok: düğümde test ediliyor (testler/wrapped-plan.mjs). */

const ALFABE = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789'

/** Pano satırı en çok 12 harf (spec): sığmayan isim "AYŞE K.", o da sığmazsa ilk ad, 12 harfte kesilir. */
export function panoKisalt(ad: string, en = 12) {
  const u = ad.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR')
  if ([...u].length <= en) return u
  const p = u.split(' ')
  const kisa = p.length > 1 ? `${p[0]} ${[...p[p.length - 1]][0]}.` : p[0]
  return [...kisa].length <= en ? kisa : [...p[0]].slice(0, en).join('')
}

/** Harf dönerken görünen dört harf. Rastgele değil, harfe ve yerine bağlı: her açılışta aynı, son harf aralarında yok. */
export function panoHarfleri(son: string, i: number) {
  const b = Math.max(0, ALFABE.indexOf(son))
  return [1, 2, 3, 4].map(j => ALFABE[(b + 7 * j + 3 * i) % ALFABE.length])
}

/** Tema adı gibi düz metin: 12 harfe sığan ilk kelimeler, tek kelime sığmazsa 12 harfte kesilir. */
export function panoSigdir(metin: string, en = 12) {
  const u = metin.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR')
  if ([...u].length <= en) return u
  let sonuc = ''
  for (const k of u.split(' ')) {
    const aday = sonuc ? `${sonuc} ${k}` : k
    if ([...aday].length > en) break
    sonuc = aday
  }
  return sonuc || [...u].slice(0, en).join('')
}
