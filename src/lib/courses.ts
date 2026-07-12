import { supabase } from './supabase'

export interface CourseSearchResult {
  externalId: number
  clubName: string
  courseName: string
  city: string | null
  state: string | null
}

export interface TeeOption {
  teeId: string
  label: string
  numHoles: number
  hasStrokeIndex: boolean
}

export async function searchCourses(q: string): Promise<CourseSearchResult[]> {
  const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`)
  if (res.status === 503) throw new Error('Course search isn’t configured yet.')
  if (!res.ok) throw new Error('Course search failed. Try again or enter the course manually.')
  const { courses } = await res.json()
  return courses
}

/**
 * Return a cached course + its tee options for a search result, importing it from
 * the API (and caching it) only if we haven't seen it before.
 */
export async function selectOrImportCourse(r: CourseSearchResult): Promise<{ courseId: string; tees: TeeOption[] }> {
  const extId = String(r.externalId)

  const cached = await supabase.from('courses').select('id').eq('external_id', extId).maybeSingle()
  if (cached.data) {
    const teeRows = await supabase
      .from('course_tees')
      .select('id,name,par,stroke_index')
      .eq('course_id', cached.data.id)
    return {
      courseId: cached.data.id,
      tees: (teeRows.data ?? []).map((t) => ({
        teeId: t.id,
        label: t.name,
        numHoles: (t.par as number[]).length,
        hasStrokeIndex: t.stroke_index != null,
      })),
    }
  }

  const detailRes = await fetch(`/api/courses/detail?id=${r.externalId}`)
  if (!detailRes.ok) throw new Error('Couldn’t load that course. Try another or enter it manually.')
  const detail = await detailRes.json()
  if (!detail.tees?.length) throw new Error('That course has no usable tee data. Enter it manually.')

  const numHoles = detail.tees[0].numHoles
  const course = await supabase
    .from('courses')
    .insert({
      external_id: extId,
      name: `${detail.clubName} — ${detail.courseName}`.replace(/^ — | — $/g, ''),
      city: detail.city,
      state: detail.state,
      num_holes: numHoles,
    })
    .select('id')
    .single()
  if (course.error) throw course.error

  const teeRows = detail.tees.map((t: { name: string; gender: string; yardage: number | null; par: number[]; strokeIndex: (number | null)[] }) => ({
    course_id: course.data.id,
    name: `${t.name} (${t.gender === 'male' ? 'M' : 'F'})`,
    gender: t.gender,
    yardage: t.yardage,
    par: t.par,
    stroke_index: t.strokeIndex.some((x) => x == null) ? null : t.strokeIndex,
  }))
  const inserted = await supabase.from('course_tees').insert(teeRows).select('id,name,par,stroke_index')
  if (inserted.error) throw inserted.error

  return {
    courseId: course.data.id,
    tees: (inserted.data ?? []).map((t) => ({
      teeId: t.id,
      label: t.name,
      numHoles: (t.par as number[]).length,
      hasStrokeIndex: t.stroke_index != null,
    })),
  }
}
