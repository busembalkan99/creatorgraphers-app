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
  zaman    timestamptz not null default now()
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
    when 'wrapped' then (gizli.elle_son_sonuc()).id is not null
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

create or replace function gizli.elle_kalan(p_simdi timestamptz) returns int language sql stable as $$
  select greatest(0, 2 - count(*))::int from public.elle_bildirimler
   where (zaman at time zone 'Europe/Istanbul')::date = (p_simdi at time zone 'Europe/Istanbul')::date
$$;

create or replace function public.elle_bildirim_durumu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare simdi timestamptz := now(); z timestamptz := greatest(now(), gizli.gece_disi(now(), false));
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'kalan', gizli.elle_kalan(simdi),
    'abone', (select count(*) from gizli.abone_uyeler()),
    'gece', z > simdi,
    'hatirlatmalar', (select jsonb_agg(jsonb_build_object(
        'tur', t, 'gorunur', coalesce(gizli.elle_gorunur(t, simdi), false),
        'alici', (select count(*) from gizli.elle_alicilar(t, z)),
        'etiket', case when t = 'wrapped' then (select case when x.serbest then 'Ekstra etkinlik' else gizli.gun_yaz(x.bulusma_gunu) end
                                                 from gizli.elle_son_sonuc() x where x.id is not null) end) order by n)
      from unnest(array['tema_oner','yukleme','oy','tahmin','wrapped','bulusma']) with ordinality as x(t, n)),
    'son', coalesce((select jsonb_agg(jsonb_build_object('tur', b.tur, 'baslik', b.baslik, 'alici', b.alici, 'zaman', b.zaman) order by b.zaman desc)
      from (select * from public.elle_bildirimler order by zaman desc limit 10) b), '[]'::jsonb));
end $$;

revoke execute on function public.elle_bildirim_durumu() from public, anon;
grant execute on function public.elle_bildirim_durumu() to authenticated;
revoke execute on function gizli.elle_alicilar(text, timestamptz), gizli.elle_gorunur(text, timestamptz), gizli.tum_oy_kalan(uuid, uuid),
  gizli.elle_acik(), gizli.elle_son_sonuc(), gizli.elle_kalan(timestamptz) from public, anon, authenticated;
