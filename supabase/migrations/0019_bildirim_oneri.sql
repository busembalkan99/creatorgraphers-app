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
  -- Önerin seçildi (bağlandıktan sonraki ilk tur)
  for e in select * from public.etkinlikler where not iptal loop
    for u, temalar in
      select s.uye, t.ad from public.tema_onerileri t join public.temalar tm on tm.id = t.tema
        join public.oneri_sahipleri s on s.oneri = t.id
       where tm.etkinlik = e.id and t.durum = 'secildi' and t.secildi_at <= p_simdi and t.secildi_at > p_simdi - pencere
         and s.uye in (select * from gizli.abone_uyeler())
    loop
      n := n + gizli.kuyruga(u, 'oneri_secildi:' || e.id || ':' || gizli.oneri_anahtari(temalar) || ':' || u, 'oneri_secildi', e.id,
        'Önerin seçildi', temalar || ', ' || case when e.serbest then 'ekstra etkinliğin teması.' else gizli.gun_yaz(e.bulusma_gunu) || ' buluşmasının teması.' end,
        'etkinlikler', greatest(p_simdi, gizli.gece_disi(p_simdi, false)));
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function gizli.bildirim_planla(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Üyelik bildirimleri, gönderici RPC'leri, tetikleme
-- ---------------------------------------------------------------------------
-- Katılma isteği: yöneticilere; onay: kişiye (onay bekleyen de abone olabiliyor, kullanici auth.users'a bağlı)
create or replace function gizli.istek_bildirimi() returns trigger language plpgsql security definer set search_path = public as $$
declare y uuid;
begin
  if tg_op = 'INSERT' and new.durum = 'bekliyor' then
    for y in select u.id from public.uyeler u where u.cikarildi_at is null and u.rol in ('kurucu', 'yonetici')
               and exists (select 1 from public.bildirim_abonelikleri a where a.kullanici = u.id) loop
      perform gizli.kuyruga(y, 'istek:' || new.id || ':' || y, 'istek', null, 'Katılma isteği: ' || new.ad,
        'Onaylaman bekleniyor.', 'uyeler', gizli.gece_disi(now(), false));
    end loop;
  elsif tg_op = 'UPDATE' and old.durum = 'bekliyor' and new.durum = 'onay'
        and exists (select 1 from public.bildirim_abonelikleri a where a.kullanici = new.kullanici) then
    perform gizli.kuyruga(new.kullanici, 'istek_onay:' || new.id, 'istek_onay', null, 'Kulübe katıldın',
      'İsteğin onaylandı.', 'etkinlikler', gizli.gece_disi(now(), false));
  end if;
  return null;
end $$;
drop trigger if exists istek_bildirimi on public.istekler;
create trigger istek_bildirimi after insert or update of durum on public.istekler
  for each row execute function gizli.istek_bildirimi();

-- Çıkarılan üye: abonelikleri ve bekleyen bildirimleri siliniyor
create or replace function gizli.cikarilan_bildirim_sil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cikarildi_at is not null and old.cikarildi_at is null then
    delete from public.bildirim_abonelikleri where kullanici = new.id;
    delete from public.bildirim_kuyrugu where kullanici = new.id and gonderildi_at is null;
  end if;
  return null;
end $$;
drop trigger if exists cikarilan_bildirim_sil on public.uyeler;
create trigger cikarilan_bildirim_sil after update of cikarildi_at on public.uyeler
  for each row execute function gizli.cikarilan_bildirim_sil();

-- Gönderim anında yeniden doğrulama
create or replace function gizli.bildirim_gecerli(q public.bildirim_kuyrugu, p_simdi timestamptz) returns boolean
language sql stable as $$
  select case
    when q.etkinlik is not null and exists (select 1 from public.etkinlikler e where e.id = q.etkinlik and e.iptal) then false
    when q.tur <> 'istek_onay' and not exists (select 1 from public.uyeler u where u.id = q.kullanici and u.cikarildi_at is null) then false
    when q.tur = 'hatirlatma_yukleme' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.yukleme_biter = q.son_tarih and p_simdi < q.son_tarih
        and coalesce(array_length(gizli.bos_temalar(e.id, q.kullanici), 1), 0) > 0)
    when q.tur = 'hatirlatma_oy' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.oylama_biter = q.son_tarih and p_simdi < q.son_tarih
        and gizli.kalan_oy(e.id, q.kullanici) > 0)
    else true
  end
$$;

create or replace function public.bildirim_gonderilecekler(p_simdi timestamptz default now())
returns table (kuyruk bigint, endpoint text, p256dh text, auth text, baslik text, govde text, adres text)
language plpgsql security definer set search_path = public as $$
begin
  update public.bildirim_kuyrugu q set gonderildi_at = p_simdi, son_hata = 'gecersiz'
   where q.gonderildi_at is null and q.zaman <= p_simdi and not gizli.bildirim_gecerli(q, p_simdi);
  return query
    select q.id, a.endpoint, a.p256dh, a.auth, q.baslik, q.govde, q.adres
    from public.bildirim_kuyrugu q join public.bildirim_abonelikleri a on a.kullanici = q.kullanici
    where q.gonderildi_at is null and q.zaman <= p_simdi and q.deneme < 3
    order by q.zaman, q.id limit 500;
end $$;

create or replace function public.bildirim_sonuc(p_kuyruk bigint, p_basarili boolean, p_hata text)
returns void language sql security definer set search_path = public as $$
  update public.bildirim_kuyrugu
     set gonderildi_at = case when p_basarili then now() else gonderildi_at end,
         deneme = deneme + case when p_basarili then 0 else 1 end,
         son_hata = case when p_basarili then null else left(p_hata, 300) end
   where id = p_kuyruk;
$$;

create or replace function public.bildirim_abonelik_dustu(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.bildirim_abonelikleri where endpoint = p_endpoint;
$$;

revoke execute on function public.bildirim_gonderilecekler(timestamptz), public.bildirim_sonuc(bigint, boolean, text),
  public.bildirim_abonelik_dustu(text) from public, anon, authenticated;
grant execute on function public.bildirim_gonderilecekler(timestamptz), public.bildirim_sonuc(bigint, boolean, text),
  public.bildirim_abonelik_dustu(text) to service_role;

-- Cron her 5 dakikada: planla, sırada iş varsa Edge Function'ı çağır. Adres ve gizli Vault'ta (Cowork koyar).
create or replace function gizli.bildirim_tetikle() returns void language plpgsql security definer set search_path = public as $$
declare adres text; sifre text;
begin
  perform gizli.bildirim_planla();
  if not exists (select 1 from public.bildirim_kuyrugu where gonderildi_at is null and zaman <= now() and deneme < 3) then return; end if;
  select decrypted_secret into adres from vault.decrypted_secrets where name = 'bildirim_gonder_url';
  select decrypted_secret into sifre from vault.decrypted_secrets where name = 'bildirim_gizli';
  if adres is null or sifre is null then return; end if;
  perform net.http_post(url := adres, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bildirim-gizli', sifre));
end $$;
revoke execute on function gizli.bildirim_tetikle() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tema önerisi (kararlar 81, 82, 85, 89; 2026-09-30: kişi başı 3, birleşme, geri çekme)
-- ---------------------------------------------------------------------------
create table if not exists public.tema_onerileri (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null check (char_length(btrim(ad)) between 1 and 24),
  anahtar    text not null,
  durum      text not null default 'havuzda' check (durum in ('havuzda', 'secildi')),
  tema       uuid references public.temalar(id) on delete set null,
  elle       boolean not null default false,
  olusturma  timestamptz not null default now(),
  secildi_at timestamptz
);
create unique index if not exists tema_onerileri_havuzda_tekil on public.tema_onerileri (anahtar) where durum = 'havuzda';
create table if not exists public.oneri_sahipleri (
  oneri     uuid not null references public.tema_onerileri(id) on delete cascade,
  uye       uuid not null references auth.users(id) on delete cascade,
  gerekce   text check (gerekce is null or char_length(gerekce) <= 140),
  olusturma timestamptz not null default now(),
  primary key (oneri, uye)
);
alter table public.tema_onerileri enable row level security;
alter table public.oneri_sahipleri enable row level security;
revoke all on public.tema_onerileri, public.oneri_sahipleri from anon, authenticated;

create or replace function gizli.oneri_anahtari(p text) returns text language sql immutable as $$
  select lower(regexp_replace(btrim(p), '\s+', ' ', 'g'))
$$;

create or replace function public.oneri_birak(p_ad text, p_gerekce text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid; k text; acik int;
begin
  if not public.uye_mi() then raise exception 'yetki_yok'; end if;
  if p_ad is null or char_length(btrim(p_ad)) not between 1 and 24 then raise exception 'ad_gecersiz'; end if;
  if p_gerekce is not null and char_length(p_gerekce) > 140 then raise exception 'gerekce_uzun'; end if;
  k := gizli.oneri_anahtari(p_ad);
  select id into o from public.tema_onerileri where anahtar = k and durum = 'havuzda';
  if o is not null and exists (select 1 from public.oneri_sahipleri where oneri = o and uye = auth.uid()) then return o; end if;
  select count(*) into acik from public.oneri_sahipleri s join public.tema_onerileri t on t.id = s.oneri
   where s.uye = auth.uid() and t.durum = 'havuzda';
  if acik >= 3 then raise exception 'oneri_siniri'; end if;
  if o is null then insert into public.tema_onerileri (ad, anahtar) values (btrim(p_ad), k) returning id into o; end if;
  insert into public.oneri_sahipleri (oneri, uye, gerekce) values (o, auth.uid(), nullif(btrim(p_gerekce), ''));
  return o;
end $$;

create or replace function public.oneri_geri_cek(p_oneri uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.oneri_sahipleri s using public.tema_onerileri t
   where s.oneri = p_oneri and s.uye = auth.uid() and t.id = s.oneri and t.durum = 'havuzda';
  delete from public.tema_onerileri t where t.id = p_oneri and t.durum = 'havuzda' and not t.elle
     and not exists (select 1 from public.oneri_sahipleri s where s.oneri = t.id);
end $$;

create or replace function public.onerilerim()
returns table (id uuid, ad text, durum text, bulusma_gunu date, serbest boolean, olusturma timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.ad, t.durum, e.bulusma_gunu, e.serbest, s.olusturma
  from public.oneri_sahipleri s join public.tema_onerileri t on t.id = s.oneri
  left join public.temalar tm on tm.id = t.tema left join public.etkinlikler e on e.id = tm.etkinlik
  where s.uye = auth.uid() and public.uye_mi()
  order by (t.durum = 'havuzda') desc, s.olusturma desc
$$;

-- Gerekçe yöneticiye sahibiyle görünür (Buse, 2026-09-30)
drop function if exists public.havuz();
create or replace function public.havuz()
returns table (id uuid, ad text, elle boolean, onerenler text, kac_kisi int, bekledigi int, gerekceler jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.ad, t.elle,
         coalesce((select string_agg(u.ad, ', ' order by s.olusturma) from public.oneri_sahipleri s join public.uyeler u on u.id = s.uye where s.oneri = t.id), ''),
         (select count(*) from public.oneri_sahipleri s where s.oneri = t.id)::int,
         (select count(*) from public.etkinlikler e where not e.iptal and e.olusturma > t.olusturma)::int,
         coalesce((select jsonb_agg(jsonb_build_object('ad', u.ad, 'gerekce', s.gerekce) order by s.olusturma)
                     from public.oneri_sahipleri s join public.uyeler u on u.id = s.uye
                    where s.oneri = t.id and s.gerekce is not null), '[]'::jsonb)
  from public.tema_onerileri t
  where t.durum = 'havuzda' and public.yonetici_mi()
  order by t.olusturma
$$;

create or replace function public.onerileri_bagla(p_etkinlik uuid, p_baglar jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare b jsonb; tm uuid;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  for b in select * from jsonb_array_elements(coalesce(p_baglar, '[]'::jsonb)) loop
    select id into tm from public.temalar where etkinlik = p_etkinlik and sira = (b->>'sira')::int;
    if tm is null then raise exception 'tema_yok'; end if;
    update public.tema_onerileri set durum = 'secildi', tema = tm, secildi_at = now()
     where id = (b->>'oneri')::uuid and durum = 'havuzda';
  end loop;
end $$;

-- İptal: seçilen öneriler havuza (aynısı havuzdaysa önerenler ona katılır); elle yazılan temalar "yönetici yazdı" olarak havuza.
-- Ekstra etkinliğin kendiliğinden adlandırılan temaları havuza düşmüyor.
create or replace function gizli.iptalde_havuza() returns trigger language plpgsql security definer set search_path = public as $$
declare o public.tema_onerileri; var uuid; t public.temalar;
begin
  if not (new.iptal and not old.iptal) then return null; end if;
  for o in select x.* from public.tema_onerileri x join public.temalar y on y.id = x.tema where y.etkinlik = new.id loop
    select id into var from public.tema_onerileri where anahtar = o.anahtar and durum = 'havuzda';
    if var is null then
      update public.tema_onerileri set durum = 'havuzda', tema = null, secildi_at = null where id = o.id;
    else
      insert into public.oneri_sahipleri (oneri, uye, gerekce, olusturma)
        select var, uye, gerekce, olusturma from public.oneri_sahipleri where oneri = o.id on conflict do nothing;
      delete from public.tema_onerileri where id = o.id;
    end if;
  end loop;
  if not new.serbest then
    for t in select y.* from public.temalar y where y.etkinlik = new.id
               and not exists (select 1 from public.tema_onerileri x where x.tema = y.id) loop
      insert into public.tema_onerileri (ad, anahtar, elle)
        select left(btrim(t.ad), 24), gizli.oneri_anahtari(t.ad), true
        where not exists (select 1 from public.tema_onerileri where anahtar = gizli.oneri_anahtari(t.ad) and durum = 'havuzda');
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists iptalde_havuza on public.etkinlikler;
create trigger iptalde_havuza after update of iptal on public.etkinlikler
  for each row execute function gizli.iptalde_havuza();

revoke execute on function public.oneri_birak(text, text), public.oneri_geri_cek(uuid), public.onerilerim(),
  public.havuz(), public.onerileri_bagla(uuid, jsonb) from public, anon;
grant execute on function public.oneri_birak(text, text), public.oneri_geri_cek(uuid), public.onerilerim(),
  public.havuz(), public.onerileri_bagla(uuid, jsonb) to authenticated;
