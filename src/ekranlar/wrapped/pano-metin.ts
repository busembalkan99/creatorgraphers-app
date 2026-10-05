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

/** Tema adı gibi düz metin satırlara: her satır en çok 12 harf, kelime sınırında; 12'den uzun kelime
 *  bölünüyor. En çok iki satır (Buse, 2026-10-05: uzun tema adı kısalmasın, iki satıra bölünsün). */
export function panoBol(metin: string, en = 12, enCok = 2) {
  const parcalar = metin.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR').split(' ')
    .flatMap(k => { const h = [...k]; const l: string[] = []; for (let i = 0; i < h.length; i += en) l.push(h.slice(i, i + en).join('')); return l })
  const satirlar: string[] = []
  for (const p of parcalar) {
    const son = satirlar[satirlar.length - 1]
    if (son != null && [...`${son} ${p}`].length <= en) satirlar[satirlar.length - 1] = `${son} ${p}`
    else satirlar.push(p)
  }
  return satirlar.slice(0, enCok)
}
