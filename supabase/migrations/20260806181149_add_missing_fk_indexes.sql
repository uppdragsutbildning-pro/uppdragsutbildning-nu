-- Index på foreign keys som saknade dem: förbättrar joins/cascading deletes vid skalning.

create index if not exists idx_curriculum_modules_training
  on curriculum_modules(training_id);

create index if not exists idx_training_faq_training
  on training_faq(training_id);

create index if not exists idx_applications_scheduled_start
  on applications(scheduled_start_id);

create index if not exists idx_custom_requests_training
  on custom_requests(training_id);
