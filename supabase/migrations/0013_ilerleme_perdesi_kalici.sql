-- İlerleme perdesi bir kere inince kalkmıyor (karar 105, güvenlik turu 4)
--
-- 0012 "oylamada kare çıkarıldıysa bitirdi kapansın" dedi ama bunu O ANKİ satırlardan
-- hesaplıyordu. Denetçi perdenin ipini yöneticinin tuttuğunu gösterdi: kareyi çıkar,
-- herkes oylayabildiğini oylasın, sonra kareyi GERİ AL. Satır silinince perde kalkıyor
-- ve altındaki tablo hiç değişmemiş oluyordu: o kareye oy veremeyen herkes bir eksik,
-- eksiği olmayan tek kişi sahibi. Uygulamanın kendi yolundan çalıştırdı.
--
-- Perde artık etkinliğin üstünde duran bir işaret: oylama sürerken diskalifiyeye
-- dokunulduysa (çıkarma ya da geri alma) işaret bir kere konuyor ve sonuca kadar
-- kalkmıyor. Yöneticinin geri alması perdeyi kaldırmıyor, yalnız kendi hatasını
-- düzeltiyor.
--
-- Etkinlik tablosuna yazma yetkisi 0011'de kalktığı için bu işareti yalnız buradaki
-- fonksiyonlar koyabiliyor.

alter table public.etkinlikler add column if not exists ilerleme_kapali boolean not null default false;

-- Oylamada kare çıkarmak perdeyi indiriyor
create or replace function public.kare_cikar(p_kare uuid, p_neden text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_neden, ''))) not between 1 and 140 then
    raise exception 'neden_gerekli' using errcode = 'P0001';
  end if;
  select e2.* into e from public.etkinlikler e2
    join public.temalar t on t.etkinlik = e2.id
    join public.kareler k on k.tema = t.id
   where k.id = p_kare;
  if e.id is null then raise exception 'kare_yok' using errcode = 'P0001'; end if;
  if e.iptal then raise exception 'etkinlik_yok' using errcode = 'P0001'; end if;
  insert into public.diskalifiye (kare, neden, eden) values (p_kare, btrim(p_neden), auth.uid())
  on conflict (kare) do update set neden = excluded.neden, eden = excluded.eden;
  if public.asama(e) = 'oylama' then
    update public.etkinlikler set ilerleme_kapali = true where id = e.id;
  end if;
end $$;

-- Geri almak da perdeyi indiriyor: geri alma da ölçüyü oynatan bir hareket.
-- Yükleme aşamasındaki geri alma serbest kaldı: ilerleme listesi o aşamada zaten
-- kapalı, dolayısıyla sızdıracak bir şey yok. (0012 bunu yanlışlıkla kapatmıştı;
-- Aşama ekranındaki "geri al" düğmesi yükleme boyunca ölü kalıyordu.)
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
    -- Oylamada, oylamadan önce çıkarılmış kare geri alınmaz: ölçüye girer ve
    -- beklentisi artmayan kişi sahibi olur
    if public.asama(e) = 'oylama' and d.zaman < e.yukleme_biter then
      raise exception 'toplu_geri' using errcode = 'P0001';
    end if;
  end if;
  delete from public.diskalifiye where kare = p_kare;
  if public.asama(e) = 'oylama' then
    update public.etkinlikler set ilerleme_kapali = true where id = e.id;
  end if;
end $$;

-- İlerleme: perde artık etkinliğin işaretinden okunuyor, o anki satırlardan değil
drop function if exists public.oylama_ilerlemesi(uuid);
create function public.oylama_ilerlemesi(p_etkinlik uuid)
returns table (uye uuid, ad text, durum text, kapali boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.yukleme_biter, e.ilerleme_kapali, public.asama(e) as asama
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
    select (select asama from ev) = 'oylama'
       and (select ilerleme_kapali from ev) as kapali
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
