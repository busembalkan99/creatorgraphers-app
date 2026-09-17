-- Sonuçlar (kararlar 7, 10, 18, 19, 21, 24, 38, 43, 52, 68)
-- Sonuç aşaması açılınca isimler görünür. Sıralamaya girenlerin puanı herkese açık;
-- girmeyenlerin puanı yalnız kendisine. Bu ayrım sunucuda yapılıyor.

-- Karar 21: ilk etkinlikte ham ortalama. Karar 20: kişi kendi karesine puan vermiyor,
-- yani bir karenin oy sayısı katılan sayısından bir eksik olabilir.
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
    select k.*, t.ad as tema_ad, t.sira as tema_sira,
           avg(o.puan) as ort, count(o.kare) as oy
    from public.kareler k
    join public.temalar t on t.id = k.tema
    left join public.oylar o on o.kare = k.id
    where t.etkinlik = p_etkinlik
    group by k.id, t.ad, t.sira
  ), sirali as (
    select kare.*,
           -- Puanlar eşitse önce yüklenen önde. Aynı anda yazılan kareler için son ayraç
           -- kimlik: sıra her zaman tek ve herkese aynı çıkıyor.
           -- Ortak birincilik gösterilmiyor (karara bağlanmadı).
           rank() over (partition by kare.tema order by kare.ort desc nulls last, kare.yukleme_at, kare.id) as yer,
           -- Karar 19: tema başına round(kare sayısı / 2,5), en fazla 5 kare sıralı gösterilir.
           -- En az 1: karar 18 her temaya bir kazanan veriyor, formül az karede 0 çıkarıyordu
           -- ve temanın karesi puansız kalıyordu.
           greatest(1, least(5, round(count(*) over (partition by kare.tema) / 2.5))) as kac
    from kare
  )
  select s.id, s.tema, s.tema_ad, s.tema_sira,
         s.dosya, s.genislik, s.yukseklik,
         s.sahip, u.ad, s.sahip = auth.uid(),
         -- Karar 38 ve 52: sıralamaya girmeyen karenin puanını yalnız sahibi görür
         case when s.yer <= s.kac or s.sahip = auth.uid() then round(s.ort, 1) end,
         case when s.yer <= s.kac or s.sahip = auth.uid() then s.oy end,
         -- Sıra da puandan çıkıyor: sıralamaya girmeyenin sırası da gizli
         case when s.yer <= s.kac or s.sahip = auth.uid() then s.yer end,
         s.yer <= s.kac,
         s.cekim_gunu,
         -- Karar 24: makine bilgisi sonuçlarla birlikte açılıyor
         s.kamera, s.objektif, s.odak, s.diyafram, s.enstantane, s.iso
  from sirali s
  join public.uyeler u on u.id = s.sahip
  join public.etkinlikler e on e.id = p_etkinlik
  where public.uye_mi() and public.asama(e) = 'sonuc'
  -- Sıralananlar sıraya göre, karar 68: geri kalanlar yükleme sırasına göre.
  -- Hepsini sıraya göre dizmek, gizlenen puanı ekranda yeniden görünür yapıyordu.
  order by s.tema_sira, case when s.yer <= s.kac then s.yer end nulls last, s.yukleme_at
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
