-- 0026: yöneticinin elle bildirimi (spec 2026-10-06_elle-bildirim_v1). Kuyruk 0019'daki; gönderici değişmiyor.
-- Yönetici cevapları yalnız sayı taşıyor (kararlar 9, 52). Tekrar uygulanabilir.

create table if not exists public.elle_bildirimler (
  id       bigint generated always as identity primary key,
  gonderen uuid not null references auth.users(id) on delete cascade,
  tur      text not null check (tur in ('tema_oner','yukleme','oy','tahmin','wrapped','bulusma','serbest')),
  baslik   text not null,
  govde    text not null,
  adres    text not null,
  alici    int not null,
  zaman    timestamptz not null default now(),
  gun      date not null   -- teslim günü (İstanbul): gece gönderilen ertesi sabaha kalıyor; hak ve tekrar buna göre
);
alter table public.elle_bildirimler enable row level security;
revoke all on public.elle_bildirimler from anon, authenticated;

alter table public.bildirim_kuyrugu drop constraint if exists bildirim_kuyrugu_tur_check;
alter table public.bildirim_kuyrugu add constraint bildirim_kuyrugu_tur_check check (tur in (
  'yukleme_acildi','oylama_acildi','sonuc_acildi','hatirlatma_yukleme','hatirlatma_oy','yeni_etkinlik','istek','istek_onay',
  'oneri_secildi','elle_tema_oner','elle_yukleme','elle_oy','elle_tahmin','elle_wrapped','elle_bulusma','elle_serbest'));

-- Oylayabildiği bütün karelerden (oylama_kareleri'nin listesi) puanlamadığı
create or replace function gizli.tum_oy_kalan(p_etkinlik uuid, p_uye uuid) returns int language sql stable as $$
  select count(*)::int from public.kareler k join public.temalar t on t.id = k.tema
   where t.etkinlik = p_etkinlik and k.sahip <> p_uye and not gizli.cikarildi(k.id)
     and not exists (select 1 from public.oylar o where o.kare = k.id and o.veren = p_uye)
$$;

-- Açık (bitmemiş, iptal olmayan) en son etkinlik ve sonucu açık en son etkinlik
create or replace function gizli.elle_acik() returns public.etkinlikler language sql stable as $$
  select e from public.etkinlikler e where not e.iptal and public.asama(e) in ('baslamadi','yukleme','oylama')
   order by e.yukleme_baslar desc limit 1
$$;
create or replace function gizli.elle_son_sonuc() returns public.etkinlikler language sql stable as $$
  select e from public.etkinlikler e where not e.iptal and public.asama(e) = 'sonuc' order by e.oylama_biter desc limit 1
$$;

create or replace function gizli.elle_gorunur(p_tur text, p_simdi timestamptz) returns boolean language sql stable as $$
  select case p_tur
    when 'tema_oner' then true
    when 'serbest' then true
    when 'yukleme' then (select (gizli.elle_acik()).yukleme_baslar <= p_simdi and p_simdi < (gizli.elle_acik()).yukleme_biter)
    when 'oy' then (select (gizli.elle_acik()).yukleme_biter <= p_simdi and p_simdi < (gizli.elle_acik()).oylama_biter)
    when 'tahmin' then (select (gizli.elle_acik()).yukleme_biter <= p_simdi and p_simdi < (gizli.elle_acik()).oylama_biter)
    -- Yeni etkinliğin yüklemesi açılınca eski Wrapped hatırlatması kalkıyor (Buse, 2026-10-06)
    when 'wrapped' then (gizli.elle_son_sonuc()).id is not null
                        and coalesce(public.asama(gizli.elle_acik()) not in ('yukleme', 'oylama'), true)
    when 'bulusma' then (select not (gizli.elle_acik()).serbest
                          and (gizli.elle_acik()).bulusma_gunu >= (p_simdi at time zone 'Europe/Istanbul')::date)
    else false end
$$;

-- Alıcılar ve kişiye göre metin. p_zaman: bildirimin gideceği an (gece ertelemesi sonrası); süreler ona göre.
create or replace function gizli.elle_alicilar(p_tur text, p_zaman timestamptz)
returns table (uye uuid, etkinlik uuid, baslik text, govde text, adres text, son_tarih timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare e public.etkinlikler; gun date := (p_zaman at time zone 'Europe/Istanbul')::date; temalar text;
begin
  if not coalesce(gizli.elle_gorunur(p_tur, p_zaman), false) then return; end if;
  if p_tur = 'tema_oner' then
    return query select u, null::uuid, 'Tema havuzu seni bekliyor'::text,
      'Aklında bir tema varsa öner, bir sonraki buluşmanın teması olabilir.'::text, 'oner'::text, null::timestamptz
      from gizli.abone_uyeler() u
     where not exists (select 1 from public.oneri_sahipleri s join public.tema_onerileri t on t.id = s.oneri
                        where s.uye = u and t.durum = 'havuzda');
  elsif p_tur = 'serbest' then
    return query select u, null::uuid, null::text, null::text, null::text, null::timestamptz from gizli.abone_uyeler() u;
  elsif p_tur = 'wrapped' then
    e := gizli.elle_son_sonuc();
    return query select u, e.id, 'Wrapped''in hazır'::text,
      case when e.serbest then 'Ekstra etkinliğin özeti seni bekliyor.' else gizli.gun_yaz(e.bulusma_gunu) || ' buluşmasının özeti seni bekliyor.' end,
      'wrapped/' || e.id, null::timestamptz
      from gizli.abone_uyeler() u
     where not exists (select 1 from public.wrapped_izlendi w where w.uye = u and w.etkinlik = e.id);
  else
    e := gizli.elle_acik();
    if p_tur = 'yukleme' then
      return query select u, e.id,
        'Yükleme ' || greatest(1, round(extract(epoch from e.yukleme_biter - p_zaman) / 3600))::int || ' saat sonra kapanıyor',
        case when array_length(b, 1) = 1 then b[1] || ' temasına karen yok' else array_length(b, 1) || ' temaya karen yok' end,
        'yukle'::text, e.yukleme_biter
        from gizli.abone_uyeler() u, lateral (select gizli.bos_temalar(e.id, u) b) x
       where coalesce(array_length(b, 1), 0) > 0 and p_zaman < e.yukleme_biter;
    elsif p_tur = 'oy' then
      return query select u, e.id,
        'Oylama ' || greatest(1, round(extract(epoch from e.oylama_biter - p_zaman) / 3600))::int || ' saat sonra kapanıyor',
        k || ' kare kaldı', 'oyla'::text, e.oylama_biter
        from gizli.abone_uyeler() u, lateral (select gizli.kalan_oy(e.id, u) k) x
       where k > 0 and p_zaman < e.oylama_biter;
    elsif p_tur = 'tahmin' then
      if (select count(*) from gizli.tahmin_havuzu(e.id)) < 6 then return; end if;
      return query select u, e.id, 'Tahmin oyunu açık'::text, 'Oylamanı bitirdin. Hangi kare kimin, tahmin et.'::text,
        'tahmin/' || e.id, e.oylama_biter
        from gizli.abone_uyeler() u
       where gizli.tum_oy_kalan(e.id, u) = 0
         and exists (select 1 from public.kareler k join public.temalar t on t.id = k.tema where t.etkinlik = e.id and k.sahip <> u)
         and not exists (select 1 from public.tahmin_oyun g where g.etkinlik = e.id and g.uye = u)
         and p_zaman < e.oylama_biter;
    elsif p_tur = 'bulusma' then
      select string_agg(t.ad, ', ' order by t.sira) into temalar from public.temalar t where t.etkinlik = e.id;
      return query select u, e.id,
        case when e.bulusma_gunu = gun then 'Buluşma bugün' when e.bulusma_gunu = gun + 1 then 'Buluşma yarın'
             else 'Buluşma günü: ' || gizli.gun_yaz(e.bulusma_gunu) end,
        'Temalar: ' || coalesce(temalar, '') || '.', 'etkinlikler'::text, null::timestamptz
        from gizli.abone_uyeler() u;
    end if;
  end if;
end $$;

-- Fotoğrafa bağlı hatırlatmalar: alıcı sayısı yöneticiye gösterilmiyor (kare çıkar/geri al ile sahibi çıkarılabiliyordu;
-- 0010/0012/0013'teki oy ilerlemesi açığının aynısı, kod incelemesi F1, Buse 2026-10-06)
create or replace function gizli.elle_sayisiz(p_tur text) returns boolean language sql immutable as $$
  select p_tur in ('yukleme', 'oy', 'tahmin')
$$;

create or replace function gizli.elle_teslim(p_simdi timestamptz) returns timestamptz language sql stable as $$
  select greatest(p_simdi, gizli.gece_disi(p_simdi, false))
$$;

create or replace function gizli.elle_kalan(p_gun date) returns int language sql stable as $$
  select greatest(0, 2 - count(*))::int from public.elle_bildirimler where gun = p_gun
$$;

create or replace function gizli.elle_durum(simdi timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare z timestamptz := gizli.elle_teslim(simdi);
  gz date := (gizli.elle_teslim(simdi) at time zone 'Europe/Istanbul')::date;
begin
  return jsonb_build_object(
    'kalan', gizli.elle_kalan(gz),
    'abone', (select count(*) from gizli.abone_uyeler()),
    'gece', z > simdi,
    'hatirlatmalar', (select jsonb_agg(jsonb_build_object(
        'tur', t, 'gorunur', coalesce(gizli.elle_gorunur(t, simdi), false),
        -- Sayı yalnız görünen ve fotoğrafa bağlı olmayan satırda; teslim gününde almış olan sayılmıyor
        'alici', case when gizli.elle_sayisiz(t) or not coalesce(gizli.elle_gorunur(t, simdi), false) then null
                 else (select count(*) from gizli.elle_alicilar(t, z) a where not exists (
                   select 1 from public.bildirim_kuyrugu q where q.anahtar = 'elle_' || t || ':' || gz || ':' || a.uye)) end,
        'bugun', exists (select 1 from public.elle_bildirimler b where b.tur = t and b.gun = gz),
        'etiket', case when t = 'wrapped' then (select case when x.serbest then 'Ekstra etkinlik' else gizli.gun_yaz(x.bulusma_gunu) end
                                                 from gizli.elle_son_sonuc() x where x.id is not null) end) order by n)
      from unnest(array['tema_oner','yukleme','oy','tahmin','wrapped','bulusma']) with ordinality as x(t, n)),
    'son', coalesce((select jsonb_agg(jsonb_build_object('tur', b.tur, 'baslik', b.baslik,
        'alici', case when gizli.elle_sayisiz(b.tur) then null else b.alici end, 'zaman', b.zaman) order by b.zaman desc)
      from (select * from public.elle_bildirimler order by zaman desc limit 10) b), '[]'::jsonb));
end $$;

create or replace function public.elle_bildirim_durumu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  return gizli.elle_durum(now());
end $$;

revoke execute on function public.elle_bildirim_durumu() from public, anon;
grant execute on function public.elle_bildirim_durumu() to authenticated;
revoke execute on function gizli.elle_alicilar(text, timestamptz), gizli.elle_gorunur(text, timestamptz), gizli.tum_oy_kalan(uuid, uuid),
  gizli.elle_acik(), gizli.elle_son_sonuc(), gizli.elle_kalan(date), gizli.elle_sayisiz(text), gizli.elle_teslim(timestamptz),
  gizli.elle_durum(timestamptz) from public, anon, authenticated;
create or replace function gizli.elle_gonder(p_gonderen uuid, p_tur text, p_baslik text, p_govde text, p_adres text, p_simdi timestamptz)
returns int language plpgsql security definer set search_path = public as $$
declare
  z timestamptz := gizli.elle_teslim(p_simdi);
  gz date := (gizli.elle_teslim(p_simdi) at time zone 'Europe/Istanbul')::date;   -- teslim günü
  gun text := to_char(gizli.elle_teslim(p_simdi) at time zone 'Europe/Istanbul', 'YYYY-MM-DD');
  b text := btrim(coalesce(p_baslik, '')); g text := btrim(coalesce(p_govde, ''));
  kayit bigint; n int := 0; r record;
begin
  -- Aynı anda iki gönderim sınırı aşmasın
  perform pg_advisory_xact_lock(hashtext('elle_bildirim'));
  if p_tur = 'serbest' and (char_length(b) not between 1 and 40 or char_length(g) not between 1 and 140
       or p_adres is null or p_adres not in ('etkinlikler','siralama','oner','profil')) then
    raise exception 'metin_gecersiz' using errcode = 'P0001';
  end if;
  if gizli.elle_kalan(gz) <= 0 then raise exception 'elle_sinir' using errcode = 'P0001'; end if;
  insert into public.elle_bildirimler (gonderen, tur, baslik, govde, adres, alici, zaman, gun)
  values (p_gonderen, p_tur, coalesce(nullif(b, ''), p_tur), coalesce(nullif(g, ''), ''), coalesce(p_adres, ''), 0, p_simdi, gz)
  returning id into kayit;
  for r in select * from gizli.elle_alicilar(p_tur, z) loop
    n := n + gizli.kuyruga(r.uye,
      case when p_tur = 'serbest' then 'elle_serbest:' || kayit || ':' || r.uye else 'elle_' || p_tur || ':' || gun || ':' || r.uye end,
      'elle_' || p_tur, r.etkinlik,
      case when p_tur = 'serbest' then b else r.baslik end,
      case when p_tur = 'serbest' then g else r.govde end,
      case when p_tur = 'serbest' then p_adres else r.adres end,
      z, r.son_tarih);
  end loop;
  if n = 0 then raise exception 'alici_yok' using errcode = 'P0001'; end if;   -- kayıt geri alınıyor, hak yenmiyor
  update public.elle_bildirimler set alici = n where id = kayit;   -- hazırlarda başlık tür adı; ekran etiketini kendisi yazıyor
  return case when gizli.elle_sayisiz(p_tur) then null else n end;
end $$;

create or replace function public.elle_bildirim_gonder(p_tur text, p_baslik text default null, p_govde text default null, p_adres text default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  return gizli.elle_gonder(auth.uid(), p_tur, p_baslik, p_govde, p_adres, now());
end $$;
revoke execute on function public.elle_bildirim_gonder(text, text, text, text) from public, anon;
grant execute on function public.elle_bildirim_gonder(text, text, text, text) to authenticated;
revoke execute on function gizli.elle_gonder(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;

-- 0022'deki bildirim_gecerli, elle bildirim türleri eklenerek: hazırlarda koşul gönderim anında yeniden soruluyor
create or replace function gizli.bildirim_gecerli(q public.bildirim_kuyrugu, p_simdi timestamptz) returns boolean
language sql stable as $$
  select case
    when q.etkinlik is not null and exists (select 1 from public.etkinlikler e where e.id = q.etkinlik and e.iptal) then false
    when q.tur <> 'istek_onay' and not exists (select 1 from public.uyeler u where u.id = q.kullanici and u.cikarildi_at is null) then false
    when q.tur = 'istek' then exists (
      select 1 from public.istekler i where i.id = split_part(q.anahtar, ':', 2)::uuid and i.durum = 'bekliyor')
    when q.tur = 'hatirlatma_yukleme' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.yukleme_biter = q.son_tarih and p_simdi < q.son_tarih
        and coalesce(array_length(gizli.bos_temalar(e.id, q.kullanici), 1), 0) > 0)
    when q.tur = 'hatirlatma_oy' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.oylama_biter = q.son_tarih and p_simdi < q.son_tarih
        and gizli.kalan_oy(e.id, q.kullanici) > 0)
    when q.tur = 'yukleme_acildi' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and p_simdi < e.yukleme_biter)
    when q.tur = 'oylama_acildi' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and p_simdi < e.oylama_biter)
    when q.tur = 'elle_yukleme' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.yukleme_biter = q.son_tarih and p_simdi < q.son_tarih
        and coalesce(array_length(gizli.bos_temalar(e.id, q.kullanici), 1), 0) > 0)
    when q.tur = 'elle_oy' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.oylama_biter = q.son_tarih and p_simdi < q.son_tarih
        and gizli.kalan_oy(e.id, q.kullanici) > 0)
    when q.tur = 'elle_tahmin' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.oylama_biter = q.son_tarih and p_simdi < q.son_tarih)
        and not exists (select 1 from public.tahmin_oyun g where g.etkinlik = q.etkinlik and g.uye = q.kullanici)
    when q.tur = 'elle_wrapped' then not exists (
      select 1 from public.wrapped_izlendi w where w.uye = q.kullanici and w.etkinlik = q.etkinlik)
    when q.tur = 'elle_tema_oner' then not exists (
      select 1 from public.oneri_sahipleri s join public.tema_onerileri t on t.id = s.oneri
       where s.uye = q.kullanici and t.durum = 'havuzda')
    when q.tur = 'elle_bulusma' then exists (
      select 1 from public.etkinlikler e where e.id = q.etkinlik and e.bulusma_gunu >= (p_simdi at time zone 'Europe/Istanbul')::date)
    else true
  end
$$;
