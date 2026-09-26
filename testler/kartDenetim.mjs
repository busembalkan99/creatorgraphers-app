// Kart sistemi denetimi (karar 118), ekrandan bağımsız kısmı: köşe, iç boşluk, çizgi kalıntısı,
// başlık, nefes, taşma. kart.mjs ekran ekran, davranis-tahmin.mjs oylama ve tahmin durumlarında çağırıyor.
export async function kartDenetle(p, ad, bekle) {
    const r = await p.evaluate(() => {
      const px = v => parseFloat(v) || 0;
      const kartlar = [...document.querySelectorAll('.kart, .satir-kartlari > *, .bos-kart, .mud-kart, .odul .kazanan, .live, .mesaj, .tahmin-kart')];
      const koseler = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
      const koseHatali = kartlar.filter(k => koseler.some(y => px(getComputedStyle(k)[y]) !== 8)).map(k => k.className);
      // Birincinin kartında fotoğraf kenardan kenara; boşluğu künye şeridi taşıyor
      const bosluk = [...kartlar.filter(k => !k.matches('.odul .kazanan')), ...document.querySelectorAll('.odul .serit')].filter(k => { const s = getComputedStyle(k); return px(s.paddingLeft) < 12 || px(s.paddingRight) < 12; }).map(k => k.className);
      const foto = [...document.querySelectorAll('.kart img, .satir-kartlari img, .izgara img, .kursu img')].filter(i => px(getComputedStyle(i).borderTopLeftRadius) !== 4).length;
      const kalin = [...document.querySelectorAll('.sc *')].filter(e => px(getComputedStyle(e).borderTopWidth) >= 2 && !e.closest('.kunye, .tabs, .prog, .sekmeler')).map(e => e.className);
      const tasma = kartlar.filter(k => { const kb = k.getBoundingClientRect(); return [...k.querySelectorAll('*')].some(c => { const cb = c.getBoundingClientRect(); return cb.width > 0 && (cb.right > kb.right + 1 || cb.bottom > kb.bottom + 1); }); }).map(k => k.className);
      // Kesik çizgili boş kutular kartla yer değiştirdi; kartın kendisinde ve içinde çizgi yok
      const kesik = [...document.querySelectorAll('.sc *')].filter(e => getComputedStyle(e).borderTopStyle === 'dashed').map(e => e.className);
      const ayrac = kartlar.flatMap(k => [k, ...k.querySelectorAll('*')]).filter(e => { const s = getComputedStyle(e); return !e.matches('.box, input, select, textarea') && (px(s.borderTopWidth) >= 1 || px(s.borderRightWidth) >= 1 || px(s.borderBottomWidth) >= 1
      || (s.boxShadow !== 'none' && !e.closest('button, .btn, .deg'))); }).map(e => e.className);
      // Bölüm başlığı anlamca da başlık (ekran okuyucu başlıktan başlığa atlıyor)
      const basliksiz = [...document.querySelectorAll('.kart-bas')].filter(e => e.tagName !== 'H2').length;
      // Kartın içindeki ilk öğe soldan 16px içeride (iç içe kural boşluğu ikiye katlamasın)
    const girinti = [...document.querySelectorAll('.satir-kartlari > *')].map(k => {
      const ilk = [...k.querySelectorAll('*')].find(e => !e.children.length && e.getBoundingClientRect().width > 0);
      return ilk ? { k: k.className, g: Math.round(ilk.getBoundingClientRect().left - k.getBoundingClientRect().left) } : null;
    }).filter(x => x && (x.g < 14 || x.g > 18));
    // Nefes: ayrı bölümün başlığıyla önceki blok arasında en az 36px (künyenin hemen altı hariç)
    const sikisik = [...document.querySelectorAll('h2.kart-bas, .mesaj')].map(h => {
      let o = h.previousElementSibling; while (o && !o.getBoundingClientRect().height) o = o.previousElementSibling;
      return o && !o.matches('.tepe') ? { h: h.textContent.slice(0, 20), g: Math.round(h.getBoundingClientRect().top - o.getBoundingClientRect().bottom) } : null;
    }).filter(x => x && x.g < 34);
    // Bölüm başlığı ana metin renginde, sayacı soluk
    const govde = getComputedStyle(document.body).color;
    const solukBaslik = [...document.querySelectorAll('h2.kart-bas')].filter(h => getComputedStyle(h).color !== govde || [...h.querySelectorAll('span')].some(x => getComputedStyle(x).color === govde)).length;
    const dugme = [...document.querySelectorAll('.sc .btn, .sc .secim button, .sc .rolakt button')].filter(d => px(getComputedStyle(d).borderTopLeftRadius) !== 6).length;
      // Kendi adının çipi ince (en çok 24px), dokunma alanı düğmede (en az 44px)
      const cip = [...document.querySelectorAll('.isimler .me')].map(c => ({ c: Math.round(c.getBoundingClientRect().height), d: Math.round(c.closest('button').getBoundingClientRect().height) }));
      return { sayi: kartlar.length, sikisik: sikisik.slice(0, 3), solukBaslik, girinti: girinti.slice(0, 3), basliksiz, kesik: kesik.slice(0, 4), ayrac: [...new Set(ayrac)].slice(0, 4), koseHatali, bosluk, foto, kalin: kalin.slice(0, 4), tasma: tasma.slice(0, 4), dugme, cip };
    });
    bekle(`${ad}: kart var (kontrol)`, r.sayi > 0, String(r.sayi));
    bekle(`${ad}: bütün kart köşeleri 8px`, r.koseHatali.length === 0, r.koseHatali.join(' | '));
    bekle(`${ad}: kart iç boşluğu en az 12px`, r.bosluk.length === 0, r.bosluk.join(' | '));
    bekle(`${ad}: fotoğraf köşeleri 4px`, r.foto === 0, String(r.foto));
    bekle(`${ad}: kalın çizgi kalmadı`, r.kalin.length === 0, r.kalin.join(' | '));
    bekle(`${ad}: kart başlıkları h2`, r.basliksiz === 0, String(r.basliksiz));
    bekle(`${ad}: kesik çizgili kutu kalmadı`, r.kesik.length === 0, r.kesik.join(' | '));
    bekle(`${ad}: kartta ve içinde çizgi yok`, r.ayrac.length === 0, r.ayrac.join(' | '));
    bekle(`${ad}: satır kartlarında içerik 16px içeride`, r.girinti.length === 0, JSON.stringify(r.girinti));
  bekle(`${ad}: bölümler arası nefes 36px`, r.sikisik.length === 0, JSON.stringify(r.sikisik));
  bekle(`${ad}: bölüm başlığı ana renkte, sayacı soluk`, r.solukBaslik === 0, String(r.solukBaslik));
  bekle(`${ad}: kart içeriği taşmıyor`, r.tasma.length === 0, r.tasma.join(' | '));
    bekle(`${ad}: düğme köşeleri 6px`, r.dugme === 0, String(r.dugme));
    bekle(`${ad}: kendi adının çipi ince, dokunma alanı 44px`, r.cip.every(x => x.c <= 24 && x.d >= 44), JSON.stringify(r.cip));
}
