-- API-sourced courses have created_by = null and external_id set; allow any
-- authenticated (anon) user to cache them. Manual courses still require ownership.
drop policy courses_insert on courses;
create policy courses_insert on courses for insert to authenticated
  with check (created_by = auth.uid() or external_id is not null);

drop policy course_tees_insert on course_tees;
create policy course_tees_insert on course_tees for insert to authenticated
  with check (
    exists (
      select 1 from courses c
      where c.id = course_id
        and (c.created_by = auth.uid() or c.external_id is not null)
    )
  );
