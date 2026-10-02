-- 0023: sıralama puanı karenin temasındaki yerinden (karar 125, Buse, 2026-10-03)
--
-- Karar 124'ten sonra puanlar hep aynı görünüyordu (prod'da ilk dört 5,8 · 5,8 · 5,7 · 5,7). Her kareye
-- 30 civarı oy geldiği için kare ortalamaları 5-6 arasında toplanıyor, Bayes çekimi farkı yarıya indiriyordu.
-- Artık karenin puanı ortalaması değil, temasındaki yeri:
--
--   yer puanı = 100 · (n − yer) / (n − 1)    n temadaki puanlı kare, yer kare_siralari'ndaki rank
--                                           (eşitler aynı yeri alıyor). Temada tek puanlı kare: 50.
--   puan      = (3 · 50 + Σ(w · yer puanı)) / (3 + Σw), tam sayı
--
-- Ağırlık (karar 116), Σw, eşik (karar 53), görünürlük (karar 52), imzalar ve sütunlar aynı. Çekim artık
-- kulüp ortalamasına değil sabit 50'ye: yer puanlarının ortası tanım gereği 50, C'nin görünmeyen üyeler
-- hakkında bir şey söylemesi (karar 124'te kabul edilen bedel) de böylece kalkıyor. Prod'da ilk dört 68 · 65 · 64 · 58.
-- `ortalama` sütununun adı kalıyor (istemci ve profil() okuyor), içinde artık 0-100 tam sayı var.
-- profil() 0021'deki gibi siralama()'yı okuduğu için değişmiyor. Veriye dokunmuyor, tekrar uygulanabilir.

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
  ham as (
    select ks.*, case when t.bulusmada then 1.0 else 0.5 end as agirlik,
           count(ks.ort) over (partition by ks.tema) as n
    from gizli.kare_siralari() ks
    join public.temalar t on t.id = ks.tema
    where ks.etkinlik in (select etkinlik from etk)
  ),
  -- Karar 125: karenin puanı temasındaki yeri. Birinci 100, sonuncu 0; temada tek puanlı kare 50.
  -- yer kare_siralari'ndan (rank, eşitler aynı yerde), n temadaki puanlı kare. Puansız karenin yeri yok.
  kare as (
    select ham.*,
           case when ham.ort is null then null
                when ham.n = 1 then 50.0
                else 100.0 * (ham.n - ham.yer) / (ham.n - 1) end as yp
    from ham
  ),
  kisi as (
    select k.sahip as uye, u.ad,
           -- Karar 116: serbest tema yarım ağırlıkta. Puansız kare ortalamaya girmiyor (eskisi gibi).
           sum(k.yp * k.agirlik) filter (where k.yp is not null) as toplam,
           sum(k.agirlik) filter (where k.yp is not null) as agirlik,
           count(*) as kare_sayisi,
           count(distinct k.etkinlik) filter (where k.etkinlik in (select etkinlik from bulusma)) as etkinlik_sayisi
    from kare k
    join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  -- Bayes (karar 124): m = 3 karelik ortayla (50) başlanıyor
  puanli as (
    select kisi.*,
           case when kisi.agirlik > 0
             then (3 * 50.0 + kisi.toplam) / (3 + kisi.agirlik) end as ort
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
         case when s2.yer <= s2.kac or s2.uye = auth.uid() then round(s2.ort) end,
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
-- yeter), tek kare 50'ye çekiliyor. Görünürlük ana tabloyla aynı.
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
  ham as (
    select ks.*, count(ks.ort) over (partition by ks.tema) as n
    from gizli.kare_siralari() ks
    join public.temalar t on t.id = ks.tema
    where ks.etkinlik in (select etkinlik from etk) and not t.bulusmada
  ),
  kare as (
    select ham.*,
           case when ham.ort is null then null
                when ham.n = 1 then 50.0
                else 100.0 * (ham.n - ham.yer) / (ham.n - 1) end as yp
    from ham
  ),
  kisi as (
    select k.sahip as uye, u.ad,
           sum(k.yp) as toplam, count(k.yp) as adet, count(*) as kare_sayisi
    from kare k join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  puanli as (
    select kisi.*,
           case when kisi.adet > 0
             then (3 * 50.0 + kisi.toplam) / (3 + kisi.adet) end as ort
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
         case when s2.yer <= s2.kac or s2.uye = auth.uid() then round(s2.ort) end,
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

-- create or replace yetkileri koruyor; yine de açıkça
revoke execute on function public.siralama(bigint), public.serbest_siralama(bigint) from anon, public;
grant execute on function public.siralama(bigint), public.serbest_siralama(bigint) to authenticated;
