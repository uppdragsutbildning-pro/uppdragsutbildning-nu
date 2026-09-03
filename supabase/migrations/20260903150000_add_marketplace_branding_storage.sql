-- Publik Storage-bucket för marknadsplats-varumärkning (logga + hero-bild).
-- Skrivrättigheter scopade till admin-rollen (endast UB-admin hanterar
-- branding i v1, se docs/specs/partnermarknadsplatser.md avsnitt 6).
-- Samma mönster som course-images (20260806222849_add_course_images_storage.sql).

insert into storage.buckets (id, name, public)
values ('marketplace-branding', 'marketplace-branding', true);

create policy "Admins manage marketplace branding assets"
on storage.objects for all
using (
  bucket_id = 'marketplace-branding'
  and is_admin()
)
with check (
  bucket_id = 'marketplace-branding'
  and is_admin()
);
