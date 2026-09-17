-- Sıralama ve Profil sekmeleri
-- Kararlar 11, 15, 17, 23, 24, 31, 38, 51, 52, 53, 54, 55, 56, 57, 58, 62, 98.
-- Tasarım: ideations/creatorgraphers/2026-09-12_profil-siralama-spec.md
--
-- Sözleşme etkinlikle aynı (karar 52): ilk N kişi sıralı ve puanlı, kalanlar isimli
-- ama sırasız ve puansız. Kendi ortalamanı yalnız sen görürsün. Bu ayrım sunucuda
-- yapılıyor; 20 profili tek tek gezip tam sıralamayı kurmak mümkün olmamalı.

create schema if not exists gizli;
revoke all on schema gizli from public;

-- ---------------------------------------------------------------------------
-- Yardımcılar. gizli şemasındakiler dışarı açılmıyor: ham ortalamayı taşıyorlar.
-- ---------------------------------------------------------------------------

-- Sonucu açılmış bütün etkinliklerin kareleri, tema içindeki sırasıyla.
-- Kural sonuc_kareleri ile birebir aynı (karar 19, 98).
create or replace function gizli.kare_siralari()
returns table (
  id uuid, tema uuid, tema_ad text, tema_sira smallint, etkinlik uuid, bulusma_gunu date,
  sahip uuid, ort numeric, oy bigint, yer bigint, sirali boolean
)
language sql stable security definer set search_path = public as $$
  with kare as (
    select k.id, k.tema, t.ad as tema_ad, t.sira as tema_sira, t.etkinlik,
           e.bulusma_gunu, k.sahip, avg(o.puan) as ort, count(o.kare) as oy
    from public.kareler k
    join public.temalar t on t.id = k.tema
    join public.etkinlikler e on e.id = t.etkinlik
    left join public.oylar o on o.kare = k.id
    where public.asama(e) = 'sonuc'
    group by k.id, k.tema, t.ad, t.sira, t.etkinlik, e.bulusma_gunu, k.sahip
  ), s as (
    select kare.*,
           case when kare.oy > 0
             then rank() over (partition by kare.tema order by kare.ort desc nulls last)
           end as yer,
           greatest(1, least(5, round(count(*) over (partition by kare.tema) / 2.5))) as kac
    from kare
  )
  select s.id, s.tema, s.tema_ad, s.tema_sira, s.etkinlik, s.bulusma_gunu,
         s.sahip, s.ort, s.oy, s.yer, coalesce(s.yer <= s.kac, false)
  from s
$$;

-- Etkinlikler sırayla numaralanır, sezon altı etkinliklik sabit blok (karar 11, 31).
-- İptal edilen etkinlik sırayı işgal etmez.
create or replace function gizli.sezonlar()
returns table (etkinlik uuid, bulusma_gunu date, sira bigint, sezon bigint, tamam boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.bulusma_gunu,
         row_number() over (order by e.bulusma_gunu, e.id),
         ((row_number() over (order by e.bulusma_gunu, e.id) - 1) / 6 + 1)::bigint,
         public.asama(e) = 'sonuc'
  from public.etkinlikler e
  where not e.iptal
$$;

-- ---------------------------------------------------------------------------
-- Sezon künyesi: kaçıncı sezon, kaç etkinlik tamamlandı
-- ---------------------------------------------------------------------------
create or replace function public.sezon_ozeti(p_sezon bigint default null)
returns table (sezon bigint, tamamlanan bigint, toplam bigint, uye_sayisi bigint, onceki boolean)
language sql stable security definer set search_path = public as $$
  with s as (select * from gizli.sezonlar()),
  hedef as (select coalesce(p_sezon, coalesce((select max(sezon) from s), 1)) as no)
  select h.no,
         (select count(*) from s where s.sezon = h.no and s.tamam),
         6::bigint,
         (select count(*) from public.uyeler),
         (select exists (select 1 from s where s.sezon = h.no - 1))
  from hedef h
  where public.uye_mi()
$$;

-- ---------------------------------------------------------------------------
-- Sezon sıralaması (kararlar 52, 53, 54, 98)
-- Ölçü: sezondaki bütün karelerin ham ortalaması.
-- Eşik: tamamlanan etkinliğin yarısı, yukarı yuvarlanır, en fazla 3.
-- ---------------------------------------------------------------------------
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
           case when kisi.etkinlik_sayisi >= (select adet from gereken)
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

-- ---------------------------------------------------------------------------
-- Müdavim (kararlar 23, 31, 55): son 6 tamamlanmış etkinlikte en çok katılan.
-- Çoğul ve tabansız: eşit olan herkes yazılır.
-- ---------------------------------------------------------------------------
create or replace function public.mudavim()
returns table (uye uuid, ad text, benim boolean, katilim bigint, pencere bigint)
language sql stable security definer set search_path = public as $$
  with son as (
    select s.etkinlik from gizli.sezonlar() s where s.tamam
    order by s.sira desc limit 6
  ),
  katilim as (
    select k.sahip as uye, count(distinct t.etkinlik) as adet
    from public.kareler k
    join public.temalar t on t.id = k.tema
    where t.etkinlik in (select etkinlik from son)
    group by k.sahip
  )
  select ka.uye, u.ad, ka.uye = auth.uid(), ka.adet, (select count(*) from son)
  from katilim ka
  join public.uyeler u on u.id = ka.uye
  where public.uye_mi() and ka.adet = (select max(adet) from katilim)
  order by u.ad collate "tr-TR-x-icu"
$$;

-- ---------------------------------------------------------------------------
-- Profil (kararlar 56, 57, 58)
-- ---------------------------------------------------------------------------
create or replace function public.profil(p_uye uuid default null)
returns table (
  uye uuid, ad text, benim boolean, rol text, katildi_at timestamptz,
  etkinlik_sayisi bigint, kare_sayisi bigint, seri bigint,
  tam_set boolean, tema_sayisi bigint, ortalama numeric
)
language sql stable security definer set search_path = public as $$
  with hedef as (select coalesce(p_uye, auth.uid()) as id),
  kare as (select ks.* from gizli.kare_siralari() ks, hedef h where ks.sahip = h.id),
  -- tamamlanmış etkinlikler, en yenisi 1 numara
  geri as (
    select s.etkinlik, row_number() over (order by s.sira desc) as no
    from gizli.sezonlar() s where s.tamam
  ),
  katildi as (
    select g.no, g.etkinlik, exists (select 1 from kare k where k.etkinlik = g.etkinlik) as var
    from geri g
  ),
  -- Seri kesintisiz (karar 23): en son tamamlanan etkinlikten geriye sayılır
  seri as (
    select coalesce(min(no) filter (where not var), (select count(*) from katildi) + 1) - 1 as adet
    from katildi
  ),
  -- Tam set (karar 56): katıldığı her etkinlikte bütün temalara kare verdi
  eksik as (
    select 1 from katildi ka
    where ka.var and (select count(*) from public.temalar t where t.etkinlik = ka.etkinlik)
                   > (select count(*) from kare k where k.etkinlik = ka.etkinlik)
  )
  select h.id, u.ad, h.id = auth.uid(), u.rol, u.katildi_at,
         (select count(distinct k.etkinlik) from kare k),
         (select count(*) from kare k),
         (select adet from seri),
         (select count(*) from katildi where var) > 0 and not exists (select 1 from eksik),
         (select count(distinct lower(btrim(k.tema_ad))) from kare k),
         -- Karar 38: ortalama yalnız kendi profilinde
         case when h.id = auth.uid() then (select round(avg(k.ort), 1) from kare k) end
  from hedef h
  join public.uyeler u on u.id = h.id
  where public.uye_mi()
$$;

-- Kişinin kareleri. Puan görünürlüğü etkinlikteki kuralın aynısı (karar 52).
create or replace function public.profil_kareleri(p_uye uuid default null)
returns table (
  id uuid, tema_ad text, etkinlik uuid, bulusma_gunu date,
  dosya text, genislik int, yukseklik int,
  ortalama numeric, sira bigint, sirali boolean, benim boolean,
  cekim_gunu date, kamera text, objektif text, odak text, diyafram text, enstantane text, iso text
)
language sql stable security definer set search_path = public as $$
  select ks.id, ks.tema_ad, ks.etkinlik, ks.bulusma_gunu,
         kr.dosya, kr.genislik, kr.yukseklik,
         case when ks.sirali or ks.sahip = auth.uid() then round(ks.ort, 1) end,
         case when ks.sirali or ks.sahip = auth.uid() then ks.yer end,
         ks.sirali, ks.sahip = auth.uid(),
         kr.cekim_gunu, kr.kamera, kr.objektif, kr.odak, kr.diyafram, kr.enstantane, kr.iso
  from gizli.kare_siralari() ks
  join public.kareler kr on kr.id = ks.id
  where public.uye_mi() and ks.sahip = coalesce(p_uye, auth.uid())
  order by ks.bulusma_gunu desc, ks.tema_sira
$$;

-- Çekim tarifi (karar 57, 69): makine bilgisinden türetilir, en az 3 kare şartı var.
-- 10 kareden itibaren odak dağılıma döner, altında tek değer kalır.
-- Diyafram ve ışık tek satır: ortadaki yarının aralığı (%25-%75), uçlar tarifi bozuyor.
create or replace function public.profil_tarifi(p_uye uuid default null)
returns table (tur text, etiket text, deger text, adet bigint, toplam bigint)
language sql stable security definer set search_path = public as $$
  with kare as (
    select kr.odak, kr.diyafram, kr.iso
    from gizli.kare_siralari() ks
    join public.kareler kr on kr.id = ks.id
    where ks.sahip = coalesce(p_uye, auth.uid())
  ),
  o as (select odak, count(*) as adet from kare where odak is not null group by odak),
  o_n as (select coalesce(sum(adet), 0) as n from o),
  -- percentile_disc: aradeğer uydurmuyor, gerçekten çekilmiş bir değeri seçiyor.
  -- percentile_cont "f/3,1" ya da "ISO 175" gibi hiç kullanılmamış değerler üretiyordu.
  d as (
    select percentile_disc(0.5) within group (order by f) as orta,
           percentile_disc(0.25) within group (order by f) as alt,
           percentile_disc(0.75) within group (order by f) as ust,
           count(*) as n
    from (select (regexp_replace(diyafram, '[^0-9.]', '', 'g'))::numeric as f
          from kare where diyafram ~ '[0-9]') x
  ),
  i as (
    select percentile_disc(0.5) within group (order by v) as orta,
           percentile_disc(0.25) within group (order by v) as alt,
           percentile_disc(0.75) within group (order by v) as ust,
           count(*) as n
    from (select iso::numeric as v from kare where iso ~ '^[0-9]+$') x
  ),
  odak_satir as (
    select 'odak'::text as tur, null::text as etiket, o.odak as deger,
           o.adet, (select n from o_n) as toplam
    from o
    where (select n from o_n) >= 3
      and ((select n from o_n) >= 10 or o.adet = (select max(adet) from o))
    order by o.adet desc, o.odak
    limit 3
  ),
  diyafram_satir as (
    select 'diyafram'::text, 
           case when d.orta <= 2.8 then 'Genelde açık'
                when d.orta <= 5.6 then 'Orta'
                else 'Genelde kısık' end,
           case when d.alt = d.ust then 'f/' || d.alt
                else 'f/' || d.alt || ' - f/' || d.ust end,
           d.n, d.n
    from d where d.n >= 3
  ),
  isik_satir as (
    select 'isik'::text,
           case when i.orta <= 200 then 'Bol ışıkta'
                when i.orta <= 800 then 'Karışık'
                else 'Az ışıkta' end,
           case when i.alt = i.ust then 'ISO ' || i.alt
                else 'ISO ' || i.alt || ' - ' || i.ust end,
           i.n, i.n
    from i where i.n >= 3
  )
  select * from (
    select * from odak_satir
    union all select * from diyafram_satir
    union all select * from isik_satir
  ) t
  where public.uye_mi()
  order by case t.tur when 'odak' then 1 when 'diyafram' then 2 else 3 end,
           t.adet desc, t.deger
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
