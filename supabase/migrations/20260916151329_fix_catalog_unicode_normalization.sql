-- Correct the Unicode apostrophe corrupted in the applied historical migrations.
-- Keep the validated normalization semantics and rebuild stored expression keys.
create or replace function public.ew_normalize_catalog_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(coalesce(p_value, ''))),
        '[''`’]+',
        '',
        'g'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.ew_normalize_catalog_text(text) from public, anon, authenticated;

-- Expression indexes retain their stored keys when an immutable function body
-- changes, so rebuild this index immediately after correcting normalization.
reindex index public.ew_places_active_normalized_name_trgm_idx;
