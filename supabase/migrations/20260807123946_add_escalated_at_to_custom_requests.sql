-- Förhindrar att samma obesvarade RFP eskaleras (mejl-notifiering till admin)
-- på nytt varje dygn av check-overdue-requests-cronjobbet.

alter table custom_requests
  add column if not exists escalated_at timestamptz;
