-- Oylamada kare çıkarılırsa "bitirdi" kapanır (karar 105, güvenlik turu 3)
--
-- 0010 ölçüyü dondurdu, 0011 çapayı kilitledi. Üçüncü tur dondurmanın kendisinde
-- kaldı: oylamada çıkarılan kare ölçüde duruyor ama `oy_kontrol` o kareye oy
-- verdirmiyor. Yani o kareyi kimse tamamlayamıyor; tamamlayabilen tek kişi, ölçüsünde
-- o kare hiç olmayan kişi, yani SAHİBİ. Yönetici oylama açılır açılmaz hedef kareyi
-- çıkarıp beklemekle yetiniyor: tek "bitirdi" satırı karenin sahibini söylüyor.
-- Denetçi tek bir kare_cikar çağrısıyla çalıştırdı.
--
-- Sayacı oynak kareye göre hesaplamak (çıkarılanı ölçüden düşürmek) birinci turdaki
-- açığı geri getiriyor. Bu yüzden ters yön: çıkarılan kare ölçüde kalıyor ama
-- **"bitirdi" o etkinlikte kimseye gösterilmiyor**. Oylamada kare çıkarıldıysa liste
-- yalnız "başlamadı" ve "devam ediyor" diyor, ikisi de sahiplikten bağımsız:
-- "hiç oy vermedi" ile "verdi" ayrımı yöneticinin oynatabileceği bir şey değil.
-- Sonuç açıldıktan sonra sahiplik zaten açık, orada tam liste geri geliyor.
--
-- Dördüncü sütun `kapali` ekrana "neden hiç kimse bitirmedi" diye yazabilmek için.

drop function if exists public.oylama_ilerlemesi(uuid);
create function public.oylama_ilerlemesi(p_etkinlik uuid)
returns table (uye uuid, ad text, durum text, kapali boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.yukleme_biter, public.asama(e) as asama
      from public.etkinlikler e
     where e.id = p_etkinlik
  ), kare as (
    -- Ölçü: oylama açılmadan önce çıkarılmamış kareler. Sabit; oylamada yapılan
    -- çıkarma bunu oynatmıyor (0010), çapa da yazılamıyor (0011).
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
  ), gizle as (
    -- Oylama sürerken çıkarılmış kare var mı? Varsa "bitirdi" kapanıyor.
    select (select asama from ev) = 'oylama'
       and exists (
         select 1 from public.diskalifiye d
           join kare k on k.id = d.kare
          where d.zaman >= (select yukleme_biter from ev)
       ) as kapali
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
           when (select kapali from gizle) then 'devam'
           when s.verdigi >= s.beklenen then 'bitti'
           else 'devam'
         end,
         (select kapali from gizle)
    from sayim s
   where public.yonetici_mi()
     and exists (select 1 from ev where ev.asama in ('oylama', 'sonuc'))
   order by s.ad collate "tr-TR-x-icu"
$$;

revoke execute on function public.oylama_ilerlemesi(uuid) from anon, public;
grant execute on function public.oylama_ilerlemesi(uuid) to authenticated;

-- Oylama öncesi çıkarılmış kare sonuçtan önce geri alınmaz.
--
-- Karar 103 zaten "kare kare geri alma sonuçtan sonra" diyordu; kod yalnız toplu
-- satırları tutuyordu. Tek satırlık boşluk şuydu: oylama öncesi çıkarılmış bir kareyi
-- oylamada geri almak onu ölçüye SOKUYOR, herkesin beklentisi bir artıyor, artmayan
-- kişi karenin sahibi oluyordu. Bugün ulaşılamıyor (yönetici yüklemede başkasının
-- kare kimliğini öğrenemiyor) ama kapı kapanıyor.
create or replace function public.kare_geri_al(p_kare uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.diskalifiye; e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  select d2.* into d from public.diskalifiye d2 where d2.kare = p_kare;
  if d.kare is null then return; end if;
  select e2.* into e from public.etkinlikler e2
    join public.temalar t on t.etkinlik = e2.id
    join public.kareler k on k.tema = t.id
   where k.id = p_kare;
  if public.asama(e) <> 'sonuc' then
    -- Toplu çıkarılan kare sonuçtan önce kare kare geri alınmaz: yoklama düzeltilir
    if d.toplu then raise exception 'toplu_geri' using errcode = 'P0001'; end if;
    -- Oylama öncesi çıkarılan da öyle: geri alınca ölçüye girer ve sahibini söyler
    if d.zaman < e.yukleme_biter then raise exception 'toplu_geri' using errcode = 'P0001'; end if;
  end if;
  delete from public.diskalifiye where kare = p_kare;
end $$;
