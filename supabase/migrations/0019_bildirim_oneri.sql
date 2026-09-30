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

-- ---------------------------------------------------------------------------
-- Kuyruk ve planlayıcı
-- ---------------------------------------------------------------------------
create table if not exists public.bildirim_kuyrugu (
  id            bigint generated always as identity primary key,
  kullanici     uuid not null references auth.users(id) on delete cascade,
  anahtar       text not null unique,
  tur           text not null check (tur in ('yukleme_acildi','oylama_acildi','sonuc_acildi','hatirlatma_yukleme',
                  'hatirlatma_oy','yeni_etkinlik','istek','istek_onay','oneri_secildi')),
  etkinlik      uuid references public.etkinlikler(id) on delete cascade,
  baslik        text not null,
  govde         text not null,
  adres         text not null check (adres ~ '^[a-z0-9/-]{1,80}$'),
  zaman         timestamptz not null,
  son_tarih     timestamptz,
  gonderildi_at timestamptz,
  deneme        int not null default 0,
  son_hata      text,
  olusturma     timestamptz not null default now()
);
alter table public.bildirim_kuyrugu enable row level security;
revoke all on public.bildirim_kuyrugu from anon, authenticated;
create index if not exists bildirim_kuyrugu_bekleyen on public.bildirim_kuyrugu (zaman) where gonderildi_at is null;

-- Gece gönderim yok (23.00–08.00 İstanbul). Hatırlatma önceki akşam 22.30'a, diğerleri 08.00'e.
create or replace function gizli.gece_disi(p timestamptz, p_hatirlatma boolean) returns timestamptz
language plpgsql stable as $$
declare y timestamp := p at time zone 'Europe/Istanbul'; s int := extract(hour from y); g date := y::date;
begin
  if s >= 8 and s < 23 then return p; end if;
  if p_hatirlatma then
    return ((case when s >= 23 then g else g - 1 end) + time '22:30') at time zone 'Europe/Istanbul';
  end if;
  return ((case when s >= 23 then g + 1 else g end) + time '08:00') at time zone 'Europe/Istanbul';
end $$;

create or replace function gizli.ay_adi(p date) returns text language sql immutable as $$
  select (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from p)::int]
$$;
create or replace function gizli.gun_yaz(p date) returns text language sql immutable as $$
  select extract(day from p)::int || ' ' || gizli.ay_adi(p)
$$;
create or replace function gizli.saat_yaz(p timestamptz) returns text language sql stable as $$
  select gizli.gun_yaz((p at time zone 'Europe/Istanbul')::date) || ' ' || to_char(p at time zone 'Europe/Istanbul', 'HH24.MI')
$$;
create or replace function gizli.etkinlik_adi(e public.etkinlikler) returns text language sql immutable as $$
  select case when e.serbest then 'Ekstra etkinlik' else gizli.ay_adi(e.bulusma_gunu) || ' etkinliği' end
$$;

-- Bildirim alabilecek kişiler: çıkarılmamış üye, en az bir aboneliği var
create or replace function gizli.abone_uyeler() returns setof uuid language sql stable as $$
  select u.id from public.uyeler u
  where u.cikarildi_at is null and exists (select 1 from public.bildirim_abonelikleri a where a.kullanici = u.id)
$$;

-- Kişinin kare vermediği temalar; yoklama alındıysa ve gelmediyse boş dizi (yükleyemiyor)
create or replace function gizli.bos_temalar(p_etkinlik uuid, p_uye uuid) returns text[] language sql stable as $$
  select case
    when e.yoklama_at is not null and not exists (select 1 from public.yoklama y where y.etkinlik = e.id and y.uye = p_uye)
      then array[]::text[]
    else coalesce((select array_agg(t.ad order by t.sira) from public.temalar t
                   where t.etkinlik = e.id and not exists (
                     select 1 from public.kareler k where k.tema = t.id and k.sahip = p_uye and not gizli.cikarildi(k.id))), array[]::text[])
  end
  from public.etkinlikler e where e.id = p_etkinlik
$$;

-- Oylaması zorunlu (o temada karesi var) temalarda puanlamadığı başkasının karesi
create or replace function gizli.kalan_oy(p_etkinlik uuid, p_uye uuid) returns int language sql stable as $$
  select coalesce(sum(
    (select count(*) from public.kareler k where k.tema = t.id and k.sahip <> p_uye and not gizli.cikarildi(k.id))
    - (select count(*) from public.kareler k join public.oylar o on o.kare = k.id and o.veren = p_uye
        where k.tema = t.id and k.sahip <> p_uye and not gizli.cikarildi(k.id))), 0)::int
  from public.temalar t
  where t.etkinlik = p_etkinlik
    and exists (select 1 from public.kareler m where m.tema = t.id and m.sahip = p_uye and not gizli.cikarildi(m.id))
$$;

create or replace function gizli.kuyruga(p_uye uuid, p_anahtar text, p_tur text, p_etkinlik uuid, p_baslik text,
  p_govde text, p_adres text, p_zaman timestamptz, p_son_tarih timestamptz default null) returns int
language plpgsql as $$
declare n int;
begin
  insert into public.bildirim_kuyrugu (kullanici, anahtar, tur, etkinlik, baslik, govde, adres, zaman, son_tarih)
  values (p_uye, p_anahtar, p_tur, p_etkinlik, p_baslik, p_govde, p_adres, p_zaman, p_son_tarih)
  on conflict (anahtar) do nothing;
  get diagnostics n = row_count; return n;
end $$;

create or replace function gizli.bildirim_planla(p_simdi timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0; e public.etkinlikler; u uuid; h int; an timestamptz; zm timestamptz; kalan int; bos text[]; temalar text;
  pencere constant interval := interval '6 hours';
  hatirlatma_penceresi constant interval := interval '1 hour';
begin
  for e in select * from public.etkinlikler where not iptal loop
    -- Aşama açılışları (son 6 saat)
    if e.yukleme_baslar <= p_simdi and e.yukleme_baslar > p_simdi - pencere then
      for u in select * from gizli.abone_uyeler() loop
        n := n + gizli.kuyruga(u, 'yukleme_acildi:' || e.id || ':' || u, 'yukleme_acildi', e.id,
          gizli.etkinlik_adi(e) || ': yükleme açıldı', 'Son yükleme: ' || gizli.saat_yaz(e.yukleme_biter), 'yukle',
          greatest(p_simdi, gizli.gece_disi(e.yukleme_baslar, false)));
      end loop;
    end if;
    if e.yukleme_biter <= p_simdi and e.yukleme_biter > p_simdi - pencere and e.oylama_biter > p_simdi then
      for u in select * from gizli.abone_uyeler() loop
        n := n + gizli.kuyruga(u, 'oylama_acildi:' || e.id || ':' || u, 'oylama_acildi', e.id,
          'Oylama açıldı', 'Son oy: ' || gizli.saat_yaz(e.oylama_biter), 'oyla', greatest(p_simdi, gizli.gece_disi(e.yukleme_biter, false)));
      end loop;
    end if;
    if e.oylama_biter <= p_simdi and e.oylama_biter > p_simdi - pencere then
      for u in select * from gizli.abone_uyeler() loop
        n := n + gizli.kuyruga(u, 'sonuc_acildi:' || e.id || ':' || u, 'sonuc_acildi', e.id,
          'Sonuçlar açıldı',
          case when e.serbest then 'Ekstra etkinliğin birincileri belli' else gizli.ay_adi(e.bulusma_gunu) || ' etkinliğinin birincileri belli' end,
          'sonuc/' || e.id,
          greatest(p_simdi, gizli.gece_disi(e.oylama_biter, false)));
      end loop;
    end if;
    -- Yeni etkinlik (kurulduktan sonraki ilk tur; temalar aynı işlemde eklendiği için hazır)
    if e.olusturma <= p_simdi and e.olusturma > p_simdi - pencere and e.yukleme_baslar > p_simdi then
      select string_agg(t.ad, ', ' order by t.sira) into temalar from public.temalar t where t.etkinlik = e.id;
      for u in select * from gizli.abone_uyeler() where abone_uyeler <> e.kuran loop
        n := n + gizli.kuyruga(u, 'yeni_etkinlik:' || e.id || ':' || u, 'yeni_etkinlik', e.id,
          (case when e.serbest then 'Yeni ekstra etkinlik: ' else 'Yeni etkinlik: ' end) || gizli.gun_yaz(e.bulusma_gunu),
          'Temalar: ' || coalesce(temalar, ''), 'etkinlikler', greatest(p_simdi, gizli.gece_disi(p_simdi, false)));
      end loop;
    end if;
    -- Hatırlatmalar: 12 ve 2 saat kala; geceye düşen önceki 22.30'a. Yalnız kendi zamanından sonraki 1 saatte
    -- planlanır (geç kalan eski metni göndermesin). Metin gönderim anındaki kalan süreyi en yakın saate yuvarlar.
    foreach h in array array[12, 2] loop
      an := e.yukleme_biter - make_interval(hours => h);
      zm := gizli.gece_disi(an, true);
      if an >= e.yukleme_baslar and zm <= p_simdi and zm > p_simdi - hatirlatma_penceresi and p_simdi < e.yukleme_biter then
        for u in select * from gizli.abone_uyeler() loop
          bos := gizli.bos_temalar(e.id, u);
          continue when coalesce(array_length(bos, 1), 0) = 0;
          n := n + gizli.kuyruga(u, 'hatirlatma_yukleme:' || e.id || ':' || e.yukleme_biter || ':' || zm || ':' || u, 'hatirlatma_yukleme', e.id,
            'Yükleme ' || greatest(1, round(extract(epoch from e.yukleme_biter - greatest(p_simdi, zm)) / 3600))::int || ' saat sonra kapanıyor',
            case when array_length(bos, 1) = 1 then bos[1] || ' temasına karen yok' else array_length(bos, 1) || ' temaya karen yok' end,
            'yukle', greatest(p_simdi, zm), e.yukleme_biter);
        end loop;
      end if;
      an := e.oylama_biter - make_interval(hours => h);
      zm := gizli.gece_disi(an, true);
      if an >= e.yukleme_biter and zm <= p_simdi and zm > p_simdi - hatirlatma_penceresi and p_simdi < e.oylama_biter then
        for u in select * from gizli.abone_uyeler() loop
          kalan := gizli.kalan_oy(e.id, u);
          continue when kalan <= 0;
          n := n + gizli.kuyruga(u, 'hatirlatma_oy:' || e.id || ':' || e.oylama_biter || ':' || zm || ':' || u, 'hatirlatma_oy', e.id,
            'Oylama ' || greatest(1, round(extract(epoch from e.oylama_biter - greatest(p_simdi, zm)) / 3600))::int || ' saat sonra kapanıyor',
            kalan || ' kare kaldı', 'oyla', greatest(p_simdi, zm), e.oylama_biter);
        end loop;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function gizli.bildirim_planla(timestamptz) from public, anon, authenticated;
