-- Oylama ilerlemesi (karar 105)
--
-- Buse kulüpten aktardı: sonuçlar açılana kadar kaç kişinin oy verdiği hiçbir yerde
-- görünmüyordu, yönetici kimi dürtmesi gerektiğini bilmiyordu.
--
-- İsimsizlik (karar 9): kişi başına yalnız üç durumdan biri dönüyor (bitti, devam,
-- baslamadi). Sayı dönmüyor; dönseydi kişinin oylayacağı kare sayısı (toplam eksi
-- kendi kareleri) üzerinden kaç kare yüklediği çıkarılabilirdi.
--
-- Güvenlik incelemesi burada bir açık buldu (2026-09-22): ilk hâl "oylayacak karesi
-- yok" diye dördüncü bir durum döndürüyordu ve payda o anda YARIŞAN karelerden
-- hesaplanıyordu. kare_cikar'ın aşama kilidi yok, kare_geri_al da her an geri alıyor:
-- yönetici oylamada X dışındaki bütün kareleri çıkarıp listeye bakar, durumu değişen
-- kişiyi X'in sahibi diye okur, sonra hepsini geri alırdı. Kare kare bütün sahiplik
-- haritası çıkardı. Dördüncü durum kaldırıldı ve payda SABİTLENDİ: ölçü, oylama
-- açılmadan önce çıkarılmamış kareler. Oylama sürerken yapılan çıkarma paydayı
-- oynatmıyor, yani okunacak bir sinyal kalmıyor.
--
-- Bedeli: oylamada bir kare çıkarılırsa, o kareye henüz puan vermemiş kişi artık
-- veremez ama payda onu saymaya devam eder; ekranda "devam ediyor" görünür, "bitirdi"
-- olmaz. Sonuç açıldıktan sonra sahiplik zaten açık olduğu için ölçü o anki yarışan
-- karelere dönüyor ve liste yine doğruyu söylüyor.
--
-- Yalnız yöneticiye ve yalnız oylama açıldıktan sonra. Yükleme sürerken kimse oy
-- veremediği için zaten boş olurdu, ama kapalı tutmak ileride kare kimliği sızdıran
-- bir türevini de baştan engelliyor.

create or replace function public.oylama_ilerlemesi(p_etkinlik uuid)
returns table (uye uuid, ad text, durum text)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.yukleme_biter, public.asama(e) as asama
      from public.etkinlikler e
     where e.id = p_etkinlik
  ), kare as (
    -- Ölçü: oylama açılmadan önce çıkarılmamış kareler. Oylamada çıkarılan kare
    -- ölçüde kalıyor (yukarıdaki açık). Sonuçta o anki yarışanlara dönüyor.
    select k.id, k.sahip
      from public.kareler k
      join public.temalar t on t.id = k.tema
      cross join ev
     where t.etkinlik = p_etkinlik
       and not exists (
         select 1 from public.diskalifiye d
          where d.kare = k.id
            and (ev.asama = 'sonuc' or d.zaman < ev.yukleme_biter)
       )
  ), sayim as (
    select u.id, u.ad,
           (select count(*) from kare k where k.sahip <> u.id) as beklenen,
           (select count(*) from public.oylar o join kare k on k.id = o.kare where o.veren = u.id) as verdigi
      from public.uyeler u
     where u.cikarildi_at is null
  )
  select s.id, s.ad,
         case
           -- Oylayacak karesi olmayan (hepsi kendisinin) da "başlamadı" görünüyor:
           -- ayrı bir durum, o kişinin bütün kareleri yüklediğini söylerdi.
           when s.verdigi = 0 then 'baslamadi'
           when s.verdigi >= s.beklenen then 'bitti'
           else 'devam'
         end
    from sayim s
   where public.yonetici_mi()
     and exists (select 1 from ev where ev.asama in ('oylama', 'sonuc'))
   order by s.ad collate "tr-TR-x-icu"
$$;

revoke execute on function public.oylama_ilerlemesi(uuid) from anon, public;
grant execute on function public.oylama_ilerlemesi(uuid) to authenticated;
