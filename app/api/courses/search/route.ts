import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.golfcourseapi.com'

export async function GET(req: NextRequest) {
  const key = process.env.GOLFCOURSE_API_KEY
  if (!key) return NextResponse.json({ error: 'course_search_unconfigured' }, { status: 503 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ courses: [] })

  const res = await fetch(`${BASE}/v1/search?search_query=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Key ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'course_search_failed' }, { status: 502 })

  const data = await res.json()
  const courses = (data.courses ?? []).map((c: { id: number; club_name?: string; course_name?: string; location?: { city?: string; state?: string } }) => ({
    externalId: c.id,
    clubName: c.club_name ?? '',
    courseName: c.course_name ?? '',
    city: c.location?.city ?? null,
    state: c.location?.state ?? null,
  }))
  return NextResponse.json({ courses })
}
