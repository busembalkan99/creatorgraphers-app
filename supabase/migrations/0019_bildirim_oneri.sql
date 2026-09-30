-- 0019: bildirimler (karar 120) ve tema önerisi (kararlar 81, 82, 85, 89, 121)
--
-- Web push: cihaz abonelikleri, bildirim kuyruğu, 5 dakikada bir çalışan planlayıcı (pg_cron),
-- Edge Function'ı (bildirim-gonder) çağıran tetikleyici. Tema önerisi: havuz, kişi başı 3 açık öneri,
-- aynı tema birleşiyor, geri çekme, Kurulum'da bağlama, iptalde havuza dönüş.
-- Tekrar uygulanabilir (create if not exists / create or replace / drop trigger if exists).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Abonelikler: cihaz başına bir satır (endpoint tekil). Kullanıcı auth'a bağlı,
-- onay bekleyen de abone olabiliyor ("Onaylanınca haber verelim mi?").
-- ---------------------------------------------------------------------------
create table if not exists public.bildirim_abonelikleri (
  id        uuid primary key default gen_random_uuid(),
  kullanici uuid not null references auth.users(id) on delete cascade,
  endpoint  text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh    text not null check (char_length(p256dh) <= 200),
  auth      text not null check (char_length(auth) <= 100),
  olusturma timestamptz not null default now(),
  son_hata  text
);
alter table public.bildirim_abonelikleri enable row level security;
revoke all on public.bildirim_abonelikleri from anon, authenticated;

create or replace function public.bildirim_abone_ol(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'yetki_yok'; end if;
  -- Aynı cihaz (endpoint) başka birine geçtiyse abonelik yeni sahibine geçer
  insert into public.bildirim_abonelikleri (kullanici, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set kullanici = excluded.kullanici, p256dh = excluded.p256dh, auth = excluded.auth, son_hata = null;
end $$;

create or replace function public.bildirim_aboneligi_sil(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.bildirim_abonelikleri where endpoint = p_endpoint and kullanici = auth.uid();
$$;

create or replace function public.bildirim_aboneligim_var(p_endpoint text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bildirim_abonelikleri where endpoint = p_endpoint and kullanici = auth.uid());
$$;

-- Aşama'daki "Bildirim açık: x / y üye" (yalnız sayı, isim yok)
create or replace function public.bildirim_acik_sayisi()
returns table (acik bigint, toplam bigint) language sql stable security definer set search_path = public as $$
  select count(distinct a.kullanici), count(distinct u.id)
  from public.uyeler u left join public.bildirim_abonelikleri a on a.kullanici = u.id
  where u.cikarildi_at is null and public.yonetici_mi();
$$;

revoke execute on function public.bildirim_abone_ol(text, text, text), public.bildirim_aboneligi_sil(text),
  public.bildirim_aboneligim_var(text), public.bildirim_acik_sayisi() from public, anon;
grant execute on function public.bildirim_abone_ol(text, text, text), public.bildirim_aboneligi_sil(text),
  public.bildirim_aboneligim_var(text), public.bildirim_acik_sayisi() to authenticated;
