-- Başarılar (karar 115, kararlar 15 ve 56'nın yerine)
--
-- Profildeki "Katkı" rozetleri seviyeli başarılara dönüşüyor ve yanlarına derece başarıları
-- geliyor. Sunucu yalnız sayıları veriyor; seviye eşikleri ekranda.
--
--   tam_set_sayisi  bütün temalarına kare verdiği etkinlik sayısı (eskiden "her etkinlikte" evet/hayır)
--   tema_sayisi     kare verdiği farklı tema adı sayısı (profildeki tanımın aynısı)
--   sirali_sayisi   kaç karesi kendi temasında sıralamaya girdi
--   birinci_sayisi  kaç karesi kendi temasında birinci oldu (ortak birincilik dahil)
--
-- İsimsizlik (karar 9): hepsi gizli.kare_siralari()'ndan, yani yalnız sonucu açılmış etkinlikler
-- ve yarışmadan çıkarılmamış kareler. Sıralama ve birincilik sonuç ekranında zaten herkese açık;
-- bu sayılar oradan elle de çıkarılabilir, yeni bilgi vermiyor. Karar 52'nin koruduğu sıralama dışı
-- karenin puanı burada yok.

create or replace function public.basarilar(p_uye uuid default null)
returns table (tam_set_sayisi bigint, tema_sayisi bigint, sirali_sayisi bigint, birinci_sayisi bigint)
language sql stable security definer set search_path = public as $$
  with hedef as (select coalesce(p_uye, auth.uid()) as id),
  kare as (select ks.* from gizli.kare_siralari() ks, hedef h where ks.sahip = h.id),
  etk as (
    select k.etkinlik, count(distinct k.tema) as dolu,
           (select count(*) from public.temalar t where t.etkinlik = k.etkinlik) as tema
      from kare k group by k.etkinlik
  )
  select (select count(*) from etk where dolu >= tema),
         (select count(distinct lower(btrim(k.tema_ad))) from kare k),
         (select count(*) from kare k where k.sirali),
         (select count(*) from kare k where k.sirali and k.yer = 1)
  from hedef h
  join public.uyeler u on u.id = h.id
  where public.uye_mi()
$$;

revoke execute on function public.basarilar(uuid) from anon, public;
grant execute on function public.basarilar(uuid) to authenticated;
