-- 0020: önizleme kopyası (karar 123, egress). Yükleme her karenin yanına <ad>.k.jpg önizlemesini koyuyor;
-- ızgaralar onu indiriyor. Depo kuralları klasöre göre çalıştığı için önizleme yükleme, sahibinin okuması
-- ve oylamada okuma kurallarına zaten uyuyor. İki kural ise dosyayı kareler.dosya ile tam adıyla eşliyordu:
--   toplu_cikarilan_mi  oylamada toplu çıkarılan karenin dosyasını gizliyor (isimsizlik, 0009)
--   cikarilan_dosya_mi  yöneticiye çıkarılan karenin dosyasını açıyor (0009)
-- Önizleme adı farklı olduğu için ilki önizlemeyi gizlemiyordu: klasörü listeleyen biri akışta olmayan
-- önizlemeden kimin gelmediğini çıkarabilirdi. İkisi de artık önizleme adını karenin adına çeviriyor.
-- Tekrar uygulanabilir.

-- Yalnız sondaki ".k.jpg" ".jpg"ye döner; başka her ad olduğu gibi kalır
create or replace function public.asil_dosya(p_ad text) returns text language sql immutable as $$
  select regexp_replace(p_ad, '\.k\.jpg$', '.jpg')
$$;

create or replace function public.toplu_cikarilan_mi(p_ad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kareler k
                   join public.diskalifiye d on d.kare = k.id
                   join public.temalar t on t.id = k.tema
                   join public.etkinlikler e on e.id = t.etkinlik
                 where k.dosya = public.asil_dosya(p_ad) and d.toplu and public.asama(e) <> 'sonuc')
$$;

create or replace function public.cikarilan_dosya_mi(p_ad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kareler k
                   join public.diskalifiye d on d.kare = k.id
                   join public.temalar t on t.id = k.tema
                   join public.etkinlikler e on e.id = t.etkinlik
                 where k.dosya = public.asil_dosya(p_ad) and (not d.toplu or public.asama(e) = 'sonuc'))
$$;
