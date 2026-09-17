-- Lägger till en SEO-vänlig slug per kurs (t.ex. "ledarskap-for-nya-chefer")
-- för den kanoniska URL:en /kurs/{slug}, som ersätter /training/{uuid} som
-- primär, indexerad URL (den gamla UUID-routen fortsätter fungera som ett
-- alias i frontend, se src/app/routes.tsx).
--
-- Backfill sker i tre steg: (1) generera en bas-slug ur titeln, (2) para ihop
-- dubbletter (samma bas-slug) med ett löpnummer-suffix så unikheten kan
-- garanteras, (3) lås fältet med NOT NULL + UNIQUE. Nya rader får sin slug
-- från applikationslagret (src/lib/slug.ts) vid skapande.

alter table trainings add column slug text;

with slugged as (
  select
    id,
    coalesce(
      nullif(
        trim(both '-' from
          regexp_replace(
            translate(
              lower(title),
              'åäöàáâãéèêëíìîïóòôõúùûüçñø',
              'aaoaaaaeeeeiiiiooooouuuucno'
            ),
            '[^a-z0-9]+', '-', 'g'
          )
        ),
        ''
      ),
      'kurs-' || substr(id::text, 1, 8)
    ) as base_slug
  from trainings
),
numbered as (
  select id, base_slug,
    row_number() over (partition by base_slug order by id) as rn
  from slugged
)
update trainings t
set slug = case when n.rn = 1 then n.base_slug else n.base_slug || '-' || n.rn::text end
from numbered n
where t.id = n.id;

alter table trainings alter column slug set not null;
alter table trainings add constraint trainings_slug_key unique (slug);
