-- Üye çıkarma (karar 99)
-- Çıkarılan kişinin satırı duruyor: kareleri ve adı geçmiş etkinliklerde yerinde kalıyor,
-- sonuçlar geriye dönük değişmiyor. Değişen tek şey uygulamaya girememesi.
-- Yetki: yönetici üyeyi çıkarır, yöneticiyi yalnız kurucu çıkarır, kurucu çıkarılamaz.

alter table public.uyeler add column if not exists cikarildi_at timestamptz;

-- uye_mi / yonetici_mi / kurucu_mu çıkarılmış kişiyi saymıyor. Bütün erişim bu üçünden
-- geçiyor: okuma kuralları, depo kuralları, oy verme, kare yükleme.
create or replace function public.uye_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler where id = auth.uid() and cikarildi_at is null)
$$;

create or replace function public.yonetici_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler
                  where id = auth.uid() and cikarildi_at is null and rol in ('kurucu', 'yonetici'))
$$;

create or replace function public.kurucu_mu()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler
                  where id = auth.uid() and cikarildi_at is null and rol = 'kurucu')
$$;

-- Üye listesi: çıkarılanlar sonda. Yönetici onları görüp geri alabiliyor.
create or replace function public.uye_listesi()
returns setof public.uyeler language sql stable security definer set search_path = public as $$
  select * from public.uyeler where public.yonetici_mi()
  order by (cikarildi_at is not null), katildi_at
$$;

-- Çıkarma ve geri alma
create or replace function public.uye_cikar(p_uye uuid, p_cikar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare h public.uyeler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  if p_uye = auth.uid() then raise exception 'kendini_cikaramazsin'; end if;
  select * into h from public.uyeler where id = p_uye;
  if h.id is null then raise exception 'uye_yok'; end if;
  if h.rol = 'kurucu' then raise exception 'kurucu_cikarilmaz'; end if;
  -- Yöneticiyi yalnız kurucu çıkarır ya da geri alır
  if h.rol = 'yonetici' and not public.kurucu_mu() then raise exception 'yetki_yok'; end if;
  update public.uyeler set cikarildi_at = case when p_cikar then now() end where id = p_uye;
end $$;

-- Çıkarılan kişi istek bırakabiliyor (istekler_birak kuralı "üye değilse" diyor, artık
-- çıkarılan da üye sayılmıyor). Onaylanınca satırı geri açılmalı: eski hâlinde
-- "on conflict do nothing" vardı, yani çıkarılan kişi onaylansa da giremiyordu.
create or replace function public.istek_karar(p_istek uuid, p_onay boolean)
returns void language plpgsql security definer set search_path = public as $$
declare i public.istekler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  select * into i from public.istekler where id = p_istek for update;
  if i.id is null or i.durum <> 'bekliyor' then raise exception 'istek_yok'; end if;
  update public.istekler
     set durum = case when p_onay then 'onay' else 'red' end,
         karar_at = now(), karar_veren = auth.uid()
   where id = p_istek;
  if p_onay then
    insert into public.uyeler (id, ad, eposta) values (i.kullanici, i.ad, i.eposta)
    on conflict (id) do update set cikarildi_at = null, ad = excluded.ad;
  end if;
end $$;

-- Bekleyen istek kartı: kişi daha önce çıkarıldıysa yönetici bunu görmeli.
-- Kolon eklendiği için önce düşürülüyor: create or replace dönüş tipini değiştiremiyor.
drop function if exists public.bekleyen_istekler();
create or replace function public.bekleyen_istekler()
returns table (id uuid, ad text, eposta text, notu text, olusturma timestamptz,
               onceki_red bigint, cikarilmis boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.ad, i.eposta, i.notu, i.olusturma,
         (select count(*) from public.istekler r where r.kullanici = i.kullanici and r.durum = 'red'),
         exists (select 1 from public.uyeler u where u.id = i.kullanici and u.cikarildi_at is not null)
  from public.istekler i
  where i.durum = 'bekliyor' and public.yonetici_mi()
  order by i.olusturma
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
