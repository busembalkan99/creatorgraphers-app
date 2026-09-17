-- Eşit puanda ortak birincilik (karar 98)
-- Karar 54 sezon için "eşit ortalama aynı numarayı alır (1, 2, 2, 4)" diyordu;
-- etkinlik sonucu bunun tersini yapıyor, eşitliği yükleme saatiyle bozuyordu.
-- Artık iki düzey aynı kuralı kullanıyor: eşit kareler aynı numarayı alır,
-- kendi içlerinde alfabetik dizilir, kesme çizgisindeki eşitlikte herkes içeri girer.
-- Ölçü tam ortalama; ekranda görünen yuvarlanmış puan değil.
--
-- İkinci değişiklik: hiç puan almamış kare sıralamaya hiç girmiyor, galeriye düşüyor.
-- Sıra yükleme saatinden çıktığı sürece puansız bir kare sıralı görünebiliyordu;
-- eşitlik bozulmayınca puansız karelerin hepsi aynı numarayı alırdı.

create or replace function public.sonuc_kareleri(p_etkinlik uuid)
returns table (
  id uuid, tema uuid, tema_ad text, tema_sira smallint,
  dosya text, genislik int, yukseklik int,
  sahip uuid, sahip_ad text, benim boolean,
  ortalama numeric, oy_sayisi bigint, sira bigint, sirali boolean,
  cekim_gunu date, kamera text, objektif text, odak text, diyafram text, enstantane text, iso text
)
language sql stable security definer set search_path = public as $$
  with kare as (
    select k.*, t.ad as tema_ad, t.sira as tema_sira, u.ad as uye_ad,
           avg(o.puan) as ort, count(o.kare) as oy
    from public.kareler k
    join public.temalar t on t.id = k.tema
    join public.uyeler u on u.id = k.sahip
    left join public.oylar o on o.kare = k.id
    where t.etkinlik = p_etkinlik
    group by k.id, t.ad, t.sira, u.ad
  ), sirali as (
    select kare.*,
           -- Karar 98: eşit ortalama aynı numarayı alır. rank() eşitlerden sonra
           -- numarayı atlatır (1, 1, 3) ve kesme çizgisindeki eşitleri birlikte içeri alır.
           -- Puan almamış kare sıralamaya girmez.
           case when kare.oy > 0
             then rank() over (partition by kare.tema order by kare.ort desc nulls last)
           end as yer,
           -- Karar 19: tema başına round(kare sayısı / 2,5), en fazla 5 kare sıralı gösterilir.
           -- En az 1: karar 18 her temaya bir kazanan veriyor, formül az karede 0 çıkarıyordu.
           greatest(1, least(5, round(count(*) over (partition by kare.tema) / 2.5))) as kac
    from kare
  )
  select s.id, s.tema, s.tema_ad, s.tema_sira,
         s.dosya, s.genislik, s.yukseklik,
         s.sahip, s.uye_ad, s.sahip = auth.uid(),
         -- Karar 38 ve 52: sıralamaya girmeyen karenin puanını yalnız sahibi görür
         case when s.yer <= s.kac or s.sahip = auth.uid() then round(s.ort, 1) end,
         case when s.yer <= s.kac or s.sahip = auth.uid() then s.oy end,
         -- Sıra da puandan çıkıyor: sıralamaya girmeyenin sırası da gizli
         case when s.yer <= s.kac or s.sahip = auth.uid() then s.yer end,
         coalesce(s.yer <= s.kac, false),
         s.cekim_gunu,
         -- Karar 24: makine bilgisi sonuçlarla birlikte açılıyor
         s.kamera, s.objektif, s.odak, s.diyafram, s.enstantane, s.iso
  from sirali s
  join public.etkinlikler e on e.id = p_etkinlik
  where public.uye_mi() and public.asama(e) = 'sonuc'
  -- Sıralananlar sıraya göre, eşit numaralılar alfabetik (karar 54, 98).
  -- Karar 68: geri kalanlar yükleme sırasına göre. Aynı anda yazılan iki kare için
  -- son ayraç kare kimliği: sıra her zaman tek ve herkese aynı çıkıyor.
  order by s.tema_sira,
           case when s.yer <= s.kac then s.yer end nulls last,
           case when s.yer <= s.kac then s.uye_ad end collate "tr-TR-x-icu",
           s.yukleme_at, s.id
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
