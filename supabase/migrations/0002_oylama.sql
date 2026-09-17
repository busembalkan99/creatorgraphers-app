-- Oylama (kararlar 5, 6, 7, 9, 20, 24, 37, 94)
-- İsimsiz puanlama: kareler oylama boyunca sahibi olmadan veriliyor. Kimin çektiğini
-- sunucu söylemiyor; arayüzün gizlemesine güvenilmiyor.

create table public.oylar (
  kare        uuid not null references public.kareler(id) on delete cascade,
  veren       uuid not null references auth.users(id) on delete cascade,
  puan        smallint not null check (puan between 1 and 10),   -- karar 5
  guncelleme  timestamptz not null default now(),
  primary key (kare, veren)
);

alter table public.oylar enable row level security;
revoke all on public.oylar from anon;

-- Karar 20: kişi kendi karesini puanlamaz. Karar 37: puan oylama boyunca değişebilir.
create or replace function public.oy_kontrol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k public.kareler;
  e public.etkinlikler;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- Başkası adına oy sessizce kendi oyuna çevrilmesin, açıkça reddedilsin.
  if new.veren is distinct from auth.uid() then
    raise exception 'baska_veren' using errcode = 'P0001';
  end if;
  new.guncelleme := now();
  select * into k from public.kareler where id = new.kare;
  if k.id is null then raise exception 'kare_yok' using errcode = 'P0001'; end if;
  if k.sahip = auth.uid() then raise exception 'kendi_karen' using errcode = 'P0001'; end if;
  select e2.* into e from public.etkinlikler e2
   join public.temalar t on t.etkinlik = e2.id
   where t.id = k.tema;
  if public.asama(e) <> 'oylama' then
    raise exception 'oylama_kapali' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger oy_kontrol
  before insert or update or delete on public.oylar
  for each row execute function public.oy_kontrol();

create policy oy_oku  on public.oylar for select using (veren = auth.uid());
create policy oy_ver  on public.oylar for insert with check (veren = auth.uid() and public.uye_mi());
create policy oy_degis on public.oylar for update using (veren = auth.uid()) with check (veren = auth.uid());

-- Oylama açıkken kareler isimsiz okunur. Dosya yolunda kişi yok
-- (etkinlik/tema/rastgele.jpg), yani yol kimseyi ele vermiyor.
create policy kare_dosya_oku_oylama on storage.objects for select to authenticated
  using (
    bucket_id = 'kareler' and public.uye_mi()
    and public.etkinlik_asamasi(((storage.foldername(name))[1])::uuid) in ('oylama', 'sonuc')
  );

-- Oylanacak kareler: sahibi YOK, kendi karen yok. Sıra kişiye göre karışık,
-- yükleme sırası kimseye avantaj olmasın.
create or replace function public.oylama_kareleri(p_etkinlik uuid)
returns table (id uuid, tema uuid, dosya text, genislik int, yukseklik int, puan smallint)
language sql stable security definer set search_path = public as $$
  select k.id, k.tema, k.dosya, k.genislik, k.yukseklik, o.puan
  from public.kareler k
  join public.temalar t on t.id = k.tema
  join public.etkinlikler e on e.id = t.etkinlik
  left join public.oylar o on o.kare = k.id and o.veren = auth.uid()
  where t.etkinlik = p_etkinlik
    and public.uye_mi()
    and public.asama(e) in ('oylama', 'sonuc')
    and k.sahip <> auth.uid()
  order by t.sira, md5(k.id::text || auth.uid()::text)
$$;

-- Tema tema durum: kaç kare var, kaçını puanladım, bu tema benim için zorunlu mu.
-- Karar 6 ve 20: kare yükleyen o temayı oylamak zorunda. Karar 94: karesini kaldıran değil.
create or replace function public.oylama_durumu(p_etkinlik uuid)
returns table (tema uuid, ad text, sira smallint, toplam bigint, puanladigim bigint, zorunlu boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.ad, t.sira,
         count(k.id) filter (where k.sahip <> auth.uid()),
         count(o.kare),
         exists (select 1 from public.kareler m where m.tema = t.id and m.sahip = auth.uid())
  from public.temalar t
  left join public.kareler k on k.tema = t.id
  left join public.oylar o on o.kare = k.id and o.veren = auth.uid()
  where t.etkinlik = p_etkinlik and public.uye_mi()
  group by t.id, t.ad, t.sira
  order by t.sira
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
-- Şemaya bağlı olan satır PUBLIC'in genel iznini kaldırmıyor; genel olanı da kaldır.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, public;
