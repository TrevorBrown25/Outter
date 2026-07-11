create type outing_format as enum ('stroke', 'scramble');
create type handicap_mode as enum ('none', 'manual', 'auto');
create type outing_status as enum ('setup', 'live', 'final');

create table courses (
  id            uuid primary key default gen_random_uuid(),
  external_id   text unique,
  name          text not null,
  city          text,
  state         text,
  num_holes     int not null check (num_holes in (9, 18)),
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create table course_tees (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id),
  name          text not null,
  gender        text,
  yardage       int,
  par           int[] not null,
  stroke_index  int[]
);

create table outings (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null,
  course_id     uuid not null references courses(id),
  tee_id        uuid not null references course_tees(id),
  par_snapshot  int[] not null,
  stroke_index_snapshot int[],
  play_date     date not null,
  format        outing_format not null default 'stroke',
  skins_enabled boolean not null default false,
  handicap_mode handicap_mode not null default 'none',
  status        outing_status not null default 'setup',
  share_code    text not null unique,
  created_at    timestamptz not null default now()
);

create table groups (
  id                  uuid primary key default gen_random_uuid(),
  outing_id           uuid not null references outings(id),
  name                text not null,
  scorekeeper_user_id uuid,
  created_at          timestamptz not null default now()
);

create table players (
  id             uuid primary key default gen_random_uuid(),
  outing_id      uuid not null references outings(id),
  group_id       uuid not null references groups(id),
  display_name   text not null,
  handicap_index numeric,
  created_at     timestamptz not null default now()
);

create table scores (
  id          uuid primary key default gen_random_uuid(),
  outing_id   uuid not null references outings(id),
  hole_number int not null check (hole_number between 1 and 18),
  strokes     int not null check (strokes between 1 and 30),
  player_id   uuid references players(id),
  group_id    uuid references groups(id),
  entered_by  uuid not null,
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(player_id, group_id) = 1),
  unique nulls not distinct (outing_id, hole_number, player_id, group_id)
);

create index idx_course_tees_course on course_tees(course_id);
create index idx_groups_outing on groups(outing_id);
create index idx_players_outing on players(outing_id);
create index idx_players_group on players(group_id);
create index idx_scores_outing on scores(outing_id);
