-- Üye çıkarmanın açıkları (karar 99'a ek). Güvenlik incelemesi, 2026-09-18.
--
-- 1) Çıkarılan bir yönetici istek bırakıp sıradan bir yönetici tarafından onaylanınca
--    yönetici rolüyle geri giriyordu: istek_karar satırı geri açarken rolü olduğu gibi
--    bırakıyordu. Oysa yöneticiyi yalnız kurucu geri alabiliyor (uye_cikar). İstekle
--    dönen herkes artık üye olarak dönüyor; yöneticiliği kurucu yeniden verir.
--
-- 2) Eski kuralların bir kısmı üyeliği sormuyordu. Çıkarılan kişi uygulamaya
--    giremese de API üzerinden oylama açıkken puanlarını değiştirebiliyor, kendi
--    karelerini değiştirip silebiliyordu. Çıkarma her yerde geçerli olsun.

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
    insert into public.uyeler as u (id, ad, eposta) values (i.kullanici, i.ad, i.eposta)
    on conflict (id) do update
      set cikarildi_at = null,
          ad = excluded.ad,
          -- Kurucu hiçbir zaman çıkarılamadığı için buraya düşmez; yönetici üye olur
          rol = case when u.rol = 'kurucu' then 'kurucu' else 'uye' end;
  end if;
end $$;

drop policy if exists oy_degis on public.oylar;
create policy oy_degis on public.oylar for update
  using (veren = auth.uid() and public.uye_mi())
  with check (veren = auth.uid() and public.uye_mi());

drop policy if exists kare_degis on public.kareler;
create policy kare_degis on public.kareler for update
  using (sahip = auth.uid() and public.uye_mi())
  with check (sahip = auth.uid() and public.uye_mi());

drop policy if exists kare_sil on public.kareler;
create policy kare_sil on public.kareler for delete
  using (sahip = auth.uid() and public.uye_mi());

drop policy if exists kare_dosya_sil on storage.objects;
create policy kare_dosya_sil on storage.objects for delete to authenticated
  using (bucket_id = 'kareler' and owner_id = auth.uid()::text and public.uye_mi());

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
