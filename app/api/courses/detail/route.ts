import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.golfcourseapi.com'

interface ApiHole { par: number; yardage?: number; handicap?: number | null }
interface ApiTee { tee_name?: string; total_yards?: number; number_of_holes?: number; holes?: ApiHole[] }

export async function GET(req: NextRequest) {
  const key = process.env.GOLFCOURSE_API_KEY
  if (!key) return NextResponse.json({ error: 'course_search_unconfigured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const res = await fetch(`${BASE}/v1/courses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Key ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'course_fetch_failed' }, { status: 502 })

  const c = await res.json()
  const tees: {
    name: string
    gender: 'male' | 'female'
    numHoles: number
    yardage: number | null
    par: number[]
    strokeIndex: (number | null)[]
  }[] = []

  for (const gender of ['male', 'female'] as const) {
    for (const t of (c.tees?.[gender] ?? []) as ApiTee[]) {
      const holes = t.holes ?? []
      if (holes.length !== 9 && holes.length !== 18) continue
      tees.push({
        name: t.tee_name ?? 'Tee',
        gender,
        numHoles: holes.length,
        yardage: t.total_yards ?? null,
        par: holes.map((h) => h.par),
        strokeIndex: holes.map((h) => h.handicap ?? null),
      })
    }
  }

  return NextResponse.json({
    externalId: c.id,
    clubName: c.club_name ?? '',
    courseName: c.course_name ?? '',
    city: c.location?.city ?? null,
    state: c.location?.state ?? null,
    tees,
  })
}
