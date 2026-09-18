-- Sezon sıralaması ve üye sayısı düzeltmeleri (kod inceleme notları, 2026-09-18)
--
-- 1) Hiç puan almamış kişi sezon sıralamasına girmiyor. Sezonda oy verilmemişse eşiği
--    geçen herkes puansız "sıralı" satır olarak görünüyor, "Sezonda hiç puan verilmemiş"
--    boş durumu hiç açılmıyordu. Etkinlik düzeyinde aynı kural 0004'te kurulmuştu.
-- 2) Üye sayısı çıkarılan kişileri saymıyor (karar 99). Etkinlikler başlığındaki "N üye"
--    tabloyu doğrudan sayıyordu; uyeler tablosunda çıkarılanların satırı duruyor ve
--    cikarildi_at kolonu üyelere açık değil, o yüzden sayım sunucuya taşındı.

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
  -- sezonun tamamlanmış etkinlikleri
  etk as (select s.etkinlik from s, hedef h where s.sezon = h.no and s.tamam),
  gereken as (select least(3, ceil((select count(*) from etk) / 2.0))::bigint as adet),
  kare as (
    select ks.* from gizli.kare_siralari() ks where ks.etkinlik in (select etkinlik from etk)
  ),
  kisi as (
    select k.sahip as uye, u.ad,
           avg(k.ort) as ort,
           count(*) as kare_sayisi,
           count(distinct k.etkinlik) as etkinlik_sayisi
    from kare k
    join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  -- Sezonda en yüksek puanlı karesi; puan eşitse önce yüklenen. Puan taşımıyor.
  eniyi as (
    select distinct on (k.sahip) k.sahip, kr.dosya, kr.genislik, kr.yukseklik
    from kare k
    join public.kareler kr on kr.id = k.id
    order by k.sahip, k.ort desc nulls last, kr.yukleme_at, kr.id
  ),
  sirali as (
    select kisi.*,
           kisi.etkinlik_sayisi >= (select adet from gereken) as esikte,
           -- Hiç puan almamış kişi sıralanmaz (0008): sezonda oy yoksa eşiği geçen herkes
           -- puansız "sıralı" satır oluyordu. Etkinlik düzeyindeki kuralın aynısı (karar 98).
           case when kisi.etkinlik_sayisi >= (select adet from gereken) and kisi.ort is not null
             then rank() over (
               order by case when kisi.etkinlik_sayisi >= (select adet from gereken)
                          then kisi.ort end desc nulls last)
           end as yer,
           greatest(1, least(5, round(count(*) over () / 2.5))) as kac
    from kisi
  )
  select s2.uye, s2.ad, s2.uye = auth.uid(),
         -- Karar 52: sıralamaya girmeyenin ortalaması gizli, kendininki sana açık
         case when s2.yer <= s2.kac or s2.uye = auth.uid() then round(s2.ort, 1) end,
         -- Sıra yalnız sıralamaya girende görünür, kendi sıran da gizli (spec 1. bölüm)
         case when s2.yer <= s2.kac then s2.yer end,
         coalesce(s2.yer <= s2.kac, false),
         s2.esikte,
         s2.kare_sayisi, s2.etkinlik_sayisi,
         e.dosya, e.genislik, e.yukseklik
  from sirali s2
  left join eniyi e on e.sahip = s2.uye
  where public.uye_mi()
  -- Sıralılar sıraya göre, eşitler alfabetik (karar 54). Sırasız blok da alfabetik:
  -- orada sıra yok, yani dizilişin puanı ele vermemesi gerekiyor.
  order by case when s2.yer <= s2.kac then s2.yer end nulls last,
           s2.ad collate "tr-TR-x-icu"
$$;

create or replace function public.sezon_ozeti(p_sezon bigint default null)
returns table (sezon bigint, tamamlanan bigint, toplam bigint, uye_sayisi bigint, onceki boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from gizli.sezonlar()),
  hedef as (select coalesce(p_sezon, coalesce((select max(sezon) from s), 1)) as no)
  select h.no,
         (select count(*) from s where s.sezon = h.no and s.tamam),
         6::bigint,
         (select count(*) from public.uyeler where cikarildi_at is null),
         (select exists (select 1 from s where s.sezon = h.no - 1))
  from hedef h
  where public.uye_mi()
$$;

-- Etkinlikler başlığındaki üye sayısı
create or replace function public.uye_sayisi()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.uyeler where cikarildi_at is null and public.uye_mi()
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
