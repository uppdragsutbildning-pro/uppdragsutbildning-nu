-- Privat Storage-bucket för kursbroschyrer (PDF) som leverantörer laddar upp
-- för AI-extraktion. Varje leverantör kan bara läsa/skriva sin egen mapp
-- ({provider_id}/...), enligt samma get_user_provider_id()-funktion som
-- redan används för trainings/curriculum_modules/training_faq/scheduled_starts.

insert into storage.buckets (id, name, public)
values ('course-brochures', 'course-brochures', false);

create policy "Providers manage own brochures"
on storage.objects for all
using (
  bucket_id = 'course-brochures'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
)
with check (
  bucket_id = 'course-brochures'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
);
