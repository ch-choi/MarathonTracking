create schema if not exists private;

create table if not exists private.tracking_lists (
  id uuid primary key default gen_random_uuid(),
  read_token_hash text not null unique check (read_token_hash ~ '^[0-9a-f]{64}$'),
  edit_token_hash text not null unique check (edit_token_hash ~ '^[0-9a-f]{64}$'),
  event_id text not null check (event_id in ('myresult-176', 'myresult-177')),
  bibs jsonb not null check (jsonb_typeof(bibs) = 'array' and jsonb_array_length(bibs) between 0 and 50),
  display_names jsonb not null default '{}'::jsonb check (jsonb_typeof(display_names) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);

create index if not exists tracking_lists_expires_idx on private.tracking_lists (expires_at);

alter table private.tracking_lists enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.tracking_lists from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on table private.tracking_lists to service_role;

create or replace function public.tracking_list_access(
  p_action text,
  p_read_hash text default null,
  p_edit_hash text default null,
  p_event_id text default null,
  p_bibs jsonb default null,
  p_names jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  item private.tracking_lists%rowtype;
begin
  if p_action = 'create' then
    if p_read_hash is null or p_edit_hash is null or p_event_id is null or p_bibs is null or jsonb_array_length(p_bibs) < 1 then
      raise exception 'invalid tracking list';
    end if;
    insert into private.tracking_lists (read_token_hash, edit_token_hash, event_id, bibs, display_names)
    values (p_read_hash, p_edit_hash, p_event_id, p_bibs, coalesce(p_names, '{}'::jsonb))
    returning * into item;
  elsif p_action = 'read' then
    select * into item from private.tracking_lists
    where read_token_hash = p_read_hash and revoked_at is null and expires_at > now();
    if not found then return null; end if;
  elsif p_action = 'update' then
    update private.tracking_lists
    set event_id = coalesce(p_event_id, event_id),
        bibs = coalesce(p_bibs, bibs),
        display_names = coalesce(p_names, display_names),
        updated_at = now()
    where edit_token_hash = p_edit_hash and revoked_at is null and expires_at > now()
    returning * into item;
    if not found then return null; end if;
  elsif p_action = 'revoke' then
    update private.tracking_lists
    set revoked_at = now(), updated_at = now(), bibs = '[]'::jsonb, display_names = '{}'::jsonb
    where edit_token_hash = p_edit_hash and revoked_at is null and expires_at > now();
    if not found then return null; end if;
    return jsonb_build_object('ok', true);
  else
    raise exception 'invalid tracking list action';
  end if;

  return jsonb_build_object(
    'eventId', item.event_id,
    'bibs', item.bibs,
    'names', item.display_names,
    'expiresAt', item.expires_at
  );
end;
$$;

revoke all on function public.tracking_list_access(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.tracking_list_access(text, text, text, text, jsonb, jsonb) to service_role;
