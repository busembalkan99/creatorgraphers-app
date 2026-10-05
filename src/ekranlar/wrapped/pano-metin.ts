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

/** Tema adı gibi düz metin satırlara (Buse, 2026-10-05: uzun tema adı kısalmasın, iki satıra bölünsün).
 *  Önce kelime sınırında; iki satıra sığmıyorsa harf harf (kelime ortadan bölünür ama hiçbir şey kaybolmaz).
 *  24 harfi aşan ad yine iki satırda, kesildiği "…" ile belli. */
export function panoBol(metin: string, en = 12, enCok = 2) {
  const u = metin.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR')
  const satirlar: string[] = []
  for (const k of u.split(' ')) {
    const son = satirlar[satirlar.length - 1]
    if (son != null && [...`${son} ${k}`].length <= en) satirlar[satirlar.length - 1] = `${son} ${k}`
    else satirlar.push(k)
  }
  if (satirlar.length <= enCok && satirlar.every(s => [...s].length <= en)) return satirlar
  const h = [...u]
  const dolu = Array.from({ length: enCok }, (_, i) => h.slice(i * en, (i + 1) * en).join('').trim()).filter(Boolean)
  if (h.length > en * enCok) dolu[enCok - 1] = [...dolu[enCok - 1]].slice(0, en - 1).join('') + '…'
  return dolu
}
