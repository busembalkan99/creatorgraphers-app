-- Serbest etkinlik ve serbest temanın sezondaki ağırlığı (karar 116, 2026-09-26)
--
-- Serbest temada çekim günü şartı yok (karar 92), kişi elindeki en iyi kareyi verebiliyor. Bu yüzden:
--   * Serbest temadaki kare sezon ortalamasına yarım ağırlıkla giriyor (buluşma karesi 1, serbest 0,5).
--   * Etkinlik bütünüyle serbest olabiliyor ("ekstra"): bütün temaları serbest, yoklama yine var,
--     ama sezonun altı etkinliğinden biri sayılmıyor; seri, Müdavim ve sıralama eşiği de onu saymıyor.
--   * Sıralama sekmesinde ayrı bir Serbest tablosu: yalnız serbest karelerin düz ortalaması,
--     görünürlük kuralları ana tabloyla aynı (karar 52).
--
-- Veriye dokunan tek ifade yeni sütun (varsayılan false). Var olan etkinlikler buluşma etkinliği
-- olarak kalıyor, sıralamaları yalnız buluşma etkinliklerindeki serbest temaların ağırlığı kadar değişiyor.

alter table public.etkinlikler add column if not exists serbest boolean not null default false;

-- Sezonun altı yeri yalnız buluşma etkinlikleri. Seri (profil), Müdavim, "x / 6 etkinlik" ve
-- sıralama eşiği bu listeden beslendiği için serbest etkinliği kendiliğinden saymıyorlar.
create or replace function gizli.sezonlar()
returns table (etkinlik uuid, bulusma_gunu date, sira bigint, sezon bigint, tamam boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.bulusma_gunu,
         row_number() over (order by e.bulusma_gunu, e.id),
         ((row_number() over (order by e.bulusma_gunu, e.id) - 1) / 6 + 1)::bigint,
         public.asama(e) = 'sonuc'
  from public.etkinlikler e
  where not e.iptal and not e.serbest
$$;

-- Bütün etkinlikler ve sezonları. Serbest etkinlik, kendi gününe kadar olan son buluşma
-- etkinliğinin sezonuna düşer; öncesinde hiç buluşma yoksa birinci sezona.
create or replace function gizli.sezon_etkinlikleri()
returns table (etkinlik uuid, sezon bigint, tamam boolean, serbest boolean)
language sql stable security definer set search_path = public as $$
  select s.etkinlik, s.sezon, s.tamam, false from gizli.sezonlar() s
  union all
  select e.id,
         coalesce((select max(s.sezon) from gizli.sezonlar() s where s.bulusma_gunu <= e.bulusma_gunu), 1),
         public.asama(e) = 'sonuc', true
  from public.etkinlikler e
  where e.serbest and not e.iptal
$$;

-- Sezon sıralaması: ağırlıklı ortalama. Eşik (karar 53) yalnız buluşma etkinliklerinden.
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
  kisi as (
    select k.sahip as uye, u.ad,
           -- Karar 116: serbest tema yarım ağırlıkta. Puansız kare ortalamaya girmiyor (eskisi gibi).
           sum(k.ort * k.agirlik) filter (where k.ort is not null)
             / nullif(sum(k.agirlik) filter (where k.ort is not null), 0) as ort,
           count(*) as kare_sayisi,
           count(distinct k.etkinlik) filter (where k.etkinlik in (select etkinlik from bulusma)) as etkinlik_sayisi
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
           case when kisi.etkinlik_sayisi >= (select adet from gereken) and kisi.ort is not null
             then rank() over (
               order by case when kisi.etkinlik_sayisi >= (select adet from gereken)
                          then kisi.ort end desc nulls last)
           end as yer,
           greatest(1, least(5, round(count(*) over () / 2.5))) as kac
    from kisi
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

-- Serbest tablosu: sezonun serbest temalarındaki kareler, düz ortalama. Eşik yok (tek kare yeter),
-- görünürlük ana tabloyla aynı: ilk round(kişi / 2,5) kişi (en çok 5) sıralı ve puanlı, kalanlar
-- isimli ama sırasız ve puansız; kendi ortalaman sana açık.
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
  kisi as (
    select k.sahip as uye, u.ad, avg(k.ort) as ort, count(*) as kare_sayisi
    from kare k join public.uyeler u on u.id = k.sahip
    group by k.sahip, u.ad
  ),
  eniyi as (
    select distinct on (k.sahip) k.sahip, kr.dosya, kr.genislik, kr.yukseklik
    from kare k join public.kareler kr on kr.id = k.id
    order by k.sahip, k.ort desc nulls last, kr.yukleme_at, kr.id
  ),
  sirali as (
    select kisi.*,
           case when kisi.ort is not null then rank() over (order by kisi.ort desc nulls last) end as yer,
           greatest(1, least(5, round(count(*) over () / 2.5))) as kac
    from kisi
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

-- Etkinlik kurma: serbest etkinlikte bütün temalar serbest. Eski imza kaldırılıyor; yeni
-- parametre varsayılanlı olduğu için ikisi birden dururken çağrı belirsiz kalırdı.
drop function if exists public.etkinlik_kur(date, timestamptz, int, int, jsonb);
create or replace function public.etkinlik_kur(
  p_bulusma date, p_yukleme_baslar timestamptz, p_yukleme_saat int, p_oylama_saat int,
  p_temalar jsonb,  -- [{"ad":"Sokak","bulusmada":true}, ...]
  p_serbest boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  e_id uuid;
  n int := jsonb_array_length(p_temalar);
  i int;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  if n < 1 or n > 3 then raise exception 'tema_sayisi'; end if;
  if p_yukleme_saat < 1 or p_oylama_saat < 1 then raise exception 'sure'; end if;
  if exists (select 1 from public.etkinlikler e where public.asama(e) in ('baslamadi', 'yukleme', 'oylama')) then
    raise exception 'acik_etkinlik_var';
  end if;
  insert into public.etkinlikler (bulusma_gunu, yukleme_baslar, yukleme_biter, oylama_biter, kuran, serbest)
  values (p_bulusma, p_yukleme_baslar,
          p_yukleme_baslar + make_interval(hours => p_yukleme_saat),
          p_yukleme_baslar + make_interval(hours => p_yukleme_saat + p_oylama_saat),
          auth.uid(), coalesce(p_serbest, false))
  returning id into e_id;
  for i in 0 .. n - 1 loop
    insert into public.temalar (etkinlik, ad, sira, bulusmada)
    values (e_id, btrim(p_temalar -> i ->> 'ad'), i + 1,
            case when coalesce(p_serbest, false) then false
                 else coalesce((p_temalar -> i ->> 'bulusmada')::boolean, true) end);
  end loop;
  return e_id;
end $$;

revoke execute on function public.siralama(bigint), public.serbest_siralama(bigint),
  public.etkinlik_kur(date, timestamptz, int, int, jsonb, boolean) from anon, public;
grant execute on function public.siralama(bigint), public.serbest_siralama(bigint),
  public.etkinlik_kur(date, timestamptz, int, int, jsonb, boolean) to authenticated;
revoke execute on all functions in schema gizli from anon, public, authenticated;
