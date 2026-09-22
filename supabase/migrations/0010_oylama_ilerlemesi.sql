-- Oylama ilerlemesi (karar 105)
--
-- Buse kulüpten aktardı: sonuçlar açılana kadar kaç kişinin oy verdiği hiçbir yerde
-- görünmüyordu, yönetici kimi dürtmesi gerektiğini bilmiyordu.
--
-- İsimsizlik (karar 9) bozulmuyor: fonksiyon kare ile sahibi arasında bağ kurmuyor,
-- kişi başına yalnız dört durumdan biri dönüyor (bitti, devam, baslamadi, yok).
-- Sayı dönmüyor; dönseydi kişinin
-- oylayacağı kare sayısı (toplam eksi kendi kareleri) üzerinden kaç kare yüklediği
-- çıkarılabilirdi.
--
-- Yalnız yöneticiye ve yalnız oylama açıldıktan sonra. Yükleme sürerken kimse oy
-- veremediği için zaten boş olurdu, ama kapalı tutmak ileride kare kimliği sızdıran
-- bir türevini de baştan engelliyor.

create or replace function public.oylama_ilerlemesi(p_etkinlik uuid)
returns table (uye uuid, ad text, durum text)
language sql stable security definer set search_path = public as $$
  with kare as (
    select k.id, k.sahip
      from public.kareler k
      join public.temalar t on t.id = k.tema
     where t.etkinlik = p_etkinlik and not gizli.cikarildi(k.id)
  ), sayim as (
    select u.id, u.ad,
           (select count(*) from kare k where k.sahip <> u.id) as beklenen,
           (select count(*) from public.oylar o join kare k on k.id = o.kare where o.veren = u.id) as verdigi
      from public.uyeler u
     where u.cikarildi_at is null
  )
  select s.id, s.ad,
         case
           -- Oylayacağı kare yok: etkinlikte kare yok ya da hepsi kendisinin. Bitirmiş
           -- saymıyoruz, tek oy vermeden "oy veren" sayısına girerdi.
           when s.beklenen = 0 then 'yok'
           when s.verdigi = 0 then 'baslamadi'
           when s.verdigi >= s.beklenen then 'bitti'
           else 'devam'
         end
    from sayim s
   where public.yonetici_mi()
     and exists (
       select 1 from public.etkinlikler e
        where e.id = p_etkinlik and public.asama(e) in ('oylama', 'sonuc')
     )
   order by s.ad collate "tr-TR-x-icu"
$$;

revoke execute on function public.oylama_ilerlemesi(uuid) from anon, public;
grant execute on function public.oylama_ilerlemesi(uuid) to authenticated;
