-- Publik Storage-bucket för kursbilder som leverantörer laddar upp via
-- redigeringsformuläret. Till skillnad från course-brochures (privat) är
-- denna publik, eftersom kursbilder visas öppet i katalogen för alla besökare.
-- Skrivrättigheter är fortfarande scopade per leverantör via provider_id-prefix,
-- samma mönster som course-brochures.

insert into storage.buckets (id, name, public)
values ('course-images', 'course-images', true);

create policy "Providers manage own course images"
on storage.objects for all
using (
  bucket_id = 'course-images'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
)
with check (
  bucket_id = 'course-images'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
);
