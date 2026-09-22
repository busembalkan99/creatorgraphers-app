-- Wrapped: sonuç açılışı (karar 39, spec 2026-09-20_wrapped-spec.md bölüm 7)
--
-- 0014'ten (tahmin oyunu) bağımsız: o göç değişse de bu tek başına kurulabilir.
--
-- Sonuç ekranının zaten kullandığı sonuc_kareleri kartların çoğunu besliyor. Burada yalnız
-- açılış kartının üç sayısı, kişinin kendi oy sayısı (kare vermeyen için D kartı) ve
-- "izlendi" kaydı var. Hepsi yalnız sonuç açıldıktan sonra: öncesinde kare sayısı bile
-- oylamaya dair bir şey söylemesin.

create table if not exists public.wrapped_izlendi (
  etkinlik  uuid not null references public.etkinlikler(id) on delete cascade,
  uye       uuid not null references auth.users(id) on delete cascade,
  zaman     timestamptz not null default now(),
  primary key (etkinlik, uye)
);
alter table public.wrapped_izlendi enable row level security;
-- Politika yok, yetki yok: yalnız aşağıdaki iki fonksiyon, yalnız kişinin kendi satırı
revoke all on public.wrapped_izlendi from anon, authenticated, public;

-- Açılış kartının sayıları ve kişinin kendi durumu. Yarışmadan çıkarılan kareler sayılmıyor
-- (sonuç ekranıyla aynı), kişi sayısı kare yükleyenler.
create or replace function public.wrapped_ozeti(p_etkinlik uuid)
returns table (kisi bigint, kare bigint, puan bigint, benim_oyum bigint, izlendi boolean)
language sql stable security definer set search_path = public as $$
  with k as (
    select kk.id, kk.sahip
      from public.kareler kk
      join public.temalar t on t.id = kk.tema
     where t.etkinlik = p_etkinlik and not gizli.cikarildi(kk.id)
  )
  select (select count(distinct sahip) from k),
         (select count(*) from k),
         (select count(*) from public.oylar o join k on k.id = o.kare),
         (select count(*) from public.oylar o join k on k.id = o.kare where o.veren = auth.uid()),
         exists (select 1 from public.wrapped_izlendi w where w.etkinlik = p_etkinlik and w.uye = auth.uid())
    from public.etkinlikler e
   where e.id = p_etkinlik
     and not e.iptal
     and public.uye_mi()
     and public.asama(e) = 'sonuc'
$$;

-- İzlendi (ya da atlandı) kaydı. Kişi yalnız kendi adına yazar; tekrar izlemek bir şey değiştirmez.
create or replace function public.wrapped_izle(p_etkinlik uuid)
returns void
language sql security definer set search_path = public as $$
  insert into public.wrapped_izlendi (etkinlik, uye)
  select e.id, auth.uid()
    from public.etkinlikler e
   where e.id = p_etkinlik and not e.iptal and public.uye_mi() and public.asama(e) = 'sonuc'
  on conflict do nothing
$$;

revoke execute on function public.wrapped_ozeti(uuid), public.wrapped_izle(uuid) from anon, public;
grant execute on function public.wrapped_ozeti(uuid), public.wrapped_izle(uuid) to authenticated;
