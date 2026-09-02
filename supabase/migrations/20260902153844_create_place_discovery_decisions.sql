-- Durable, source-identity-scoped discovery decisions. Source identity remains
-- present even if a legacy place is later removed, so an explicit hold cannot
-- be accidentally lost and recreated by a later source promotion.
create table public.ew_place_discovery_decisions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references public.ew_places (id) on delete set null,
  source text not null,
  source_place_id text not null,
  decision text not null,
  decision_reason text not null,
  rule_version text not null,
  taxonomy_version text,
  evidence jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ew_place_discovery_decisions_source_identity_key unique (source, source_place_id),
  constraint ew_place_discovery_decisions_source_not_blank_check check (btrim(source) <> ''),
  constraint ew_place_discovery_decisions_source_place_id_not_blank_check check (btrim(source_place_id) <> ''),
  constraint ew_place_discovery_decisions_decision_check check (decision in ('include', 'review', 'excluded')),
  constraint ew_place_discovery_decisions_reason_not_blank_check check (btrim(decision_reason) <> ''),
  constraint ew_place_discovery_decisions_rule_version_not_blank_check check (btrim(rule_version) <> ''),
  constraint ew_place_discovery_decisions_taxonomy_version_not_blank_check check (taxonomy_version is null or btrim(taxonomy_version) <> ''),
  constraint ew_place_discovery_decisions_evidence_object_check check (jsonb_typeof(evidence) = 'object')
);

create index ew_place_discovery_decisions_place_id_idx
  on public.ew_place_discovery_decisions (place_id)
  where place_id is not null;

create index ew_place_discovery_decisions_held_source_identity_idx
  on public.ew_place_discovery_decisions (source, source_place_id)
  where decision in ('review', 'excluded');

create trigger ew_place_discovery_decisions_set_updated_at
before update on public.ew_place_discovery_decisions
for each row execute function public.ew_set_updated_at();

alter table public.ew_place_discovery_decisions enable row level security;

revoke all on table public.ew_place_discovery_decisions from anon, authenticated;

grant select, insert, update, delete on table public.ew_place_discovery_decisions to service_role;
revoke truncate, references, trigger on table public.ew_place_discovery_decisions from service_role;

comment on table public.ew_place_discovery_decisions is
  'Auditable, source-identity-scoped discovery eligibility decisions. Review and excluded decisions prevent automated reactivation during source promotion.';
