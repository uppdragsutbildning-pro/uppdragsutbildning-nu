-- Lägg till response_deadline på custom_requests: grunden för eskalering vid obesvarade RFP:er.
-- Deadline sätts automatiskt till 5 arbetsdagar (helger exkluderade) efter submitted_at.

alter table custom_requests
  add column if not exists response_deadline timestamptz;

create or replace function add_business_days(start_ts timestamptz, num_days int)
returns timestamptz
language plpgsql
as $$
declare
  result timestamptz := start_ts;
  days_added int := 0;
begin
  while days_added < num_days loop
    result := result + interval '1 day';
    if extract(isodow from result) < 6 then
      days_added := days_added + 1;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function set_custom_request_response_deadline()
returns trigger
language plpgsql
as $$
begin
  if new.response_deadline is null then
    new.response_deadline := add_business_days(coalesce(new.submitted_at, now()), 5);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_response_deadline on custom_requests;

create trigger trg_set_response_deadline
  before insert on custom_requests
  for each row
  execute function set_custom_request_response_deadline();
