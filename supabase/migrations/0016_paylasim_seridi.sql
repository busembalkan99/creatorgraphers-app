-- Paylaşım kartı: kontakt şeridinin kareleri (karar 104, karar 41)
--
-- Paylaşım kartının "Kontakt" düzeni altta etkinliğin diğer karelerini şerit hâlinde
-- gösteriyor. Kart kulübün dışına (Instagram hikâyesi) çıktığı için bu, başkalarının
-- fotoğraflarını dışarı taşımak demek. Karar 41'in afiş izni tam bunun için: yalnız izni
-- açık olan üyelerin kareleri şeride giriyor. İzin bilgisi istemciye açık değil, o yüzden
-- seçim burada.
--
-- Yalnız sonuç açıldıktan sonra (sahiplik o zaman zaten açık), yalnız üyeye, en çok altı
-- kare. Paylaşanın kendi kareleri ve yarışmadan çıkarılanlar yok. Sıralamaya girenler önce.

create or replace function public.paylasim_seridi(p_etkinlik uuid)
returns table (dosya text)
language sql stable security definer set search_path = public as $$
  select s.dosya
    from public.sonuc_kareleri(p_etkinlik) s
    join public.uyeler u on u.id = s.sahip
   where not s.benim
     and not s.cikarildi
     and u.afis_izni
     and public.uye_mi()
   order by s.sirali desc, s.sira nulls last, md5(s.id::text)
   limit 6
$$;

revoke execute on function public.paylasim_seridi(uuid) from anon, public;
grant execute on function public.paylasim_seridi(uuid) to authenticated;
