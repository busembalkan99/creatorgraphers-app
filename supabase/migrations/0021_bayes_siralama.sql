-- 0021: sıralamada düzeltilmiş (Bayes) ortalama (Buse, 2026-10-02)
--
-- Sıralama kişinin ağırlıklı kare ortalamasıyla yapılıyordu (karar 116). Katılım eşiği (karar 53)
-- kare sayısına bakmadığı için sezon başında tek karesi yüksek puan alan biri çok kare verenleri
-- geçebiliyordu; Serbest tablosunda hiç eşik yok, tek kare yetiyordu. İki tablo da artık
--
--   puan = (m · C + Σ(w · ort)) / (m + Σw)
--
--   m = 3          çekim gücü, sabit
--   ort            karenin ortalama puanı (gizli.kare_siralari)
--   w              karar 116'daki ağırlık: buluşma teması 1, serbest tema 0,5; Serbest tablosunda hep 1
--   Σw             kişinin puanı olan karelerinin ağırlık toplamı. Puansız kare eskisi gibi girmiyor.
--   C              o sezonun, o tablodaki bütün puanlı karelerinin ağırlıklı ortalaması (kulüp ortalaması),
--                  her çağrıda yeniden. Serbest tablosunda yalnız serbest kareler, düz ortalama.
--
-- Az karesi olanın ortalaması kulüp ortalamasına yaklaşıyor; kare arttıkça kendi ortalaması öne çıkıyor.
-- Değişmeyenler: eşik (karar 53), görünürlük (karar 52), imzalar ve sütunlar, en iyi kare, yetkiler.
-- `ortalama` sütunu artık düzeltilmiş puanı bir ondalıkla döndürüyor. Puanlı karesi olmayanın puanı
-- yine boş (kulüp ortalaması verilmiyor). Veriye dokunmuyor, tekrar uygulanabilir.

create or replace function public.siralama(p_sezon bigint default null)
returns table (
  uye uuid, ad text, benim boolean,
  ortalama numeric, sira bigint, sirali boolean, esikte boolean,
  kare_sayisi bigint, etkinlik_sayisi bigint,
  dosya text, genislik int, yukseklik int
)
language sql stable security definer set search_path = public as $$
  with s as (select * from gizli.sezonlar()),
  hedef as (select coalesce(p_sezon, coalesce((select max(sezon) from s), 1)) as no),
  -- sezonun tamamlanmış buluşma etkinlikleri (eşik bunlardan)
  bulusma as (select s.etkinlik from s, hedef h where s.sezon = h.no and s.tamam),
  -- sezonun tamamlanmış bütün etkinlikleri, serbest dahil (ortalama bunlardan)
  etk as (
    select se.etkinlik from gizli.sezon_etkinlikleri() se, hedef h where se.sezon = h.no and se.tamam
  ),
  gereken as (select least(3, ceil((select count(*) from bulusma) / 2.0))::bigint as adet),
  kare as (
    select ks.*, case when t.bulusmada then 1.0 else 0.5 end as agirlik
    from gizli.kare_siralari() ks
    join public.temalar t on t.id = ks.tema
    where ks.etkinlik in (select etkinlik from etk)
  ),
  -- Kulüp ortalaması C: sezonun bütün puanlı kareleri, aynı ağırlıklarla. Puanlı kare yoksa boş.
  kulup as (
    select sum(k.ort * k.agirlik) / nullif(sum(k.agirlik), 0) as c
    from kare k where k.ort is not null
  ),
  kisi as (
    select k.sahip as uye, u.ad,
           -- Karar 116: serbest tema yarım ağırlıkta. Puansız kare ortalamaya girmiyor (eskisi gibi).
           sum(k.ort * k.agirlik) filter (where k.ort is not null) as toplam,
           sum(k.agirlik) filter (where k.ort is not null) as agirlik,
           count(*) as kare_sayisi,
           count(distinct k.etkinlik) filter (where k.etkinlik in (select etkinlik from bulusma)) as etkinlik_sayisi
    from kare k
    join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  -- Bayes: m = 3 karelik kulüp ortalamasıyla başlanıyor
  puanli as (
    select kisi.*,
           case when kisi.agirlik > 0
             then (3 * (select c from kulup) + kisi.toplam) / (3 + kisi.agirlik) end as ort
    from kisi
  ),
  -- Sezonda en yüksek puanlı karesi; puan eşitse önce yüklenen. Puan taşımıyor.
  eniyi as (
    select distinct on (k.sahip) k.sahip, kr.dosya, kr.genislik, kr.yukseklik
    from kare k
    join public.kareler kr on kr.id = k.id
    order by k.sahip, k.ort desc nulls last, kr.yukleme_at, kr.id
  ),
  sirali as (
    select puanli.*,
           puanli.etkinlik_sayisi >= (select adet from gereken) as esikte,
           case when puanli.etkinlik_sayisi >= (select adet from gereken) and puanli.ort is not null
             then rank() over (
               order by case when puanli.etkinlik_sayisi >= (select adet from gereken)
                          then puanli.ort end desc nulls last)
           end as yer,
           greatest(1, least(5, round(count(*) over () / 2.5))) as kac
    from puanli
  )
  select s2.uye, s2.ad, s2.uye = auth.uid(),
         case when s2.yer <= s2.kac or s2.uye = auth.uid() then round(s2.ort, 1) end,
         case when s2.yer <= s2.kac then s2.yer end,
         coalesce(s2.yer <= s2.kac, false),
         s2.esikte,
         s2.kare_sayisi, s2.etkinlik_sayisi,
         e.dosya, e.genislik, e.yukseklik
  from sirali s2
  left join eniyi e on e.sahip = s2.uye
  where public.uye_mi()
  order by case when s2.yer <= s2.kac then s2.yer end nulls last,
           s2.ad collate "tr-TR-x-icu"
$$;

-- Serbest tablosu: sezonun serbest temalarındaki kareler, hepsi aynı ağırlıkta. Eşik yok (tek kare
-- yeter) ama tek kare artık kulüp ortalamasına çekiliyor. Görünürlük ana tabloyla aynı.
create or replace function public.serbest_siralama(p_sezon bigint default null)
returns table (
  uye uuid, ad text, benim boolean,
  ortalama numeric, sira bigint, sirali boolean,
  kare_sayisi bigint,
  dosya text, genislik int, yukseklik int
)
language sql stable security definer set search_path = public as $$
  with hedef as (select coalesce(p_sezon, coalesce((select max(sezon) from gizli.sezonlar()), 1)) as no),
  etk as (
    select se.etkinlik from gizli.sezon_etkinlikleri() se, hedef h where se.sezon = h.no and se.tamam
  ),
  kare as (
    select ks.* from gizli.kare_siralari() ks
    join public.temalar t on t.id = ks.tema
    where ks.etkinlik in (select etkinlik from etk) and not t.bulusmada
  ),
  -- Kulüp ortalaması C: yalnız serbest kareler, düz ortalama
  kulup as (select avg(k.ort) as c from kare k),
  kisi as (
    select k.sahip as uye, u.ad,
           sum(k.ort) as toplam, count(k.ort) as adet, count(*) as kare_sayisi
    from kare k join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  puanli as (
    select kisi.*,
           case when kisi.adet > 0
             then (3 * (select c from kulup) + kisi.toplam) / (3 + kisi.adet) end as ort
    from kisi
  ),
  eniyi as (
    select distinct on (k.sahip) k.sahip, kr.dosya, kr.genislik, kr.yukseklik
    from kare k join public.kareler kr on kr.id = k.id
    order by k.sahip, k.ort desc nulls last, kr.yukleme_at, kr.id
  ),
  sirali as (
    select puanli.*,
           case when puanli.ort is not null then rank() over (order by puanli.ort desc nulls last) end as yer,
           greatest(1, least(5, round(count(*) over () / 2.5))) as kac
    from puanli
  )
  select s2.uye, s2.ad, s2.uye = auth.uid(),
         case when s2.yer <= s2.kac or s2.uye = auth.uid() then round(s2.ort, 1) end,
         case when s2.yer <= s2.kac then s2.yer end,
         coalesce(s2.yer <= s2.kac, false),
         s2.kare_sayisi,
         e.dosya, e.genislik, e.yukseklik
  from sirali s2
  left join eniyi e on e.sahip = s2.uye
  where public.uye_mi()
  order by case when s2.yer <= s2.kac then s2.yer end nulls last,
           s2.ad collate "tr-TR-x-icu"
$$;

-- create or replace yetkileri koruyor; yine de 0017'deki gibi açıkça
revoke execute on function public.siralama(bigint), public.serbest_siralama(bigint) from anon, public;
grant execute on function public.siralama(bigint), public.serbest_siralama(bigint) to authenticated;
