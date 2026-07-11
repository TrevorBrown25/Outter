alter table courses      enable row level security;
alter table course_tees  enable row level security;
alter table outings      enable row level security;
alter table groups       enable row level security;
alter table players      enable row level security;
alter table scores       enable row level security;

create or replace function is_organizer(p_outing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from outings where id = p_outing_id and organizer_id = auth.uid());
$$;

create or replace function can_score(p_outing_id uuid, p_player_id uuid, p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from outings o where o.id = p_outing_id and o.status <> 'final')
  and (
    is_organizer(p_outing_id)
    or exists (
      select 1 from groups g
      where g.outing_id = p_outing_id
        and g.scorekeeper_user_id = auth.uid()
        and (g.id = p_group_id
             or g.id = (select p.group_id from players p where p.id = p_player_id))
    )
  );
$$;

create policy courses_select     on courses     for select to authenticated using (true);
create policy course_tees_select on course_tees for select to authenticated using (true);
create policy outings_select     on outings     for select to authenticated using (true);
create policy groups_select      on groups      for select to authenticated using (true);
create policy players_select     on players     for select to authenticated using (true);
create policy scores_select      on scores      for select to authenticated using (true);

create policy courses_insert on courses for insert to authenticated
  with check (created_by = auth.uid());

create policy course_tees_insert on course_tees for insert to authenticated
  with check (exists (select 1 from courses c where c.id = course_id and c.created_by = auth.uid()));

create policy outings_update on outings for update to authenticated
  using (organizer_id = auth.uid());

create policy groups_update on groups for update to authenticated
  using (scorekeeper_user_id = auth.uid() or is_organizer(outing_id));
create policy groups_delete on groups for delete to authenticated
  using (is_organizer(outing_id));

create policy players_insert on players for insert to authenticated
  with check (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );
create policy players_update on players for update to authenticated
  using (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );
create policy players_delete on players for delete to authenticated
  using (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );

create policy scores_insert on scores for insert to authenticated
  with check (can_score(outing_id, player_id, group_id) and entered_by = auth.uid());
create policy scores_update on scores for update to authenticated
  using (can_score(outing_id, player_id, group_id));

create or replace function generate_share_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := (
      select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from outings where share_code = code);
  end loop;
  return code;
end;
$$;

create or replace function create_outing(
  p_course_id uuid,
  p_tee_id uuid,
  p_play_date date,
  p_format outing_format,
  p_skins boolean,
  p_handicap_mode handicap_mode
) returns outings language plpgsql volatile security definer set search_path = public as $$
declare
  v_tee course_tees;
  v_outing outings;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_tee from course_tees where id = p_tee_id and course_id = p_course_id;
  if not found then raise exception 'tee not found for course'; end if;

  insert into outings (organizer_id, course_id, tee_id, par_snapshot, stroke_index_snapshot,
                       play_date, format, skins_enabled, handicap_mode, share_code)
  values (auth.uid(), p_course_id, p_tee_id, v_tee.par, v_tee.stroke_index,
          p_play_date, p_format, p_skins, p_handicap_mode, generate_share_code())
  returning * into v_outing;
  return v_outing;
end;
$$;

create or replace function get_outing_by_code(p_code text)
returns setof outings language sql stable security definer set search_path = public as $$
  select * from outings where share_code = upper(trim(p_code));
$$;

create or replace function create_group(
  p_share_code text,
  p_name text,
  p_player_names text[],
  p_handicaps numeric[] default null
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_outing outings;
  v_group_id uuid;
  v_name text;
  i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_outing from outings
    where share_code = upper(trim(p_share_code)) and status in ('setup', 'live');
  if not found then raise exception 'outing not found or already final'; end if;
  if p_player_names is null or array_length(p_player_names, 1) is null then
    raise exception 'at least one player name required';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''),
    'Group ' || (1 + (select count(*) from groups where outing_id = v_outing.id))::text);

  insert into groups (outing_id, name, scorekeeper_user_id)
  values (v_outing.id, v_name, auth.uid())
  returning id into v_group_id;

  for i in 1 .. array_length(p_player_names, 1) loop
    insert into players (outing_id, group_id, display_name, handicap_index)
    values (v_outing.id, v_group_id, trim(p_player_names[i]),
            case when p_handicaps is not null then p_handicaps[i] end);
  end loop;
  return v_group_id;
end;
$$;

create or replace function claim_group(p_group_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_claimed boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update groups set scorekeeper_user_id = auth.uid()
    where id = p_group_id and scorekeeper_user_id is null;
  v_claimed := found;
  return v_claimed;
end;
$$;

revoke execute on function generate_share_code() from public, anon, authenticated;
grant execute on function create_outing(uuid, uuid, date, outing_format, boolean, handicap_mode) to authenticated;
grant execute on function get_outing_by_code(text) to authenticated;
grant execute on function create_group(text, text, text[], numeric[]) to authenticated;
grant execute on function claim_group(uuid) to authenticated;

alter publication supabase_realtime add table groups, players, scores;
