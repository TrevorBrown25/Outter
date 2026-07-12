'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'
import { searchCourses, selectOrImportCourse, type CourseSearchResult, type TeeOption } from '@/src/lib/courses'

const label = 'text-xs font-medium uppercase tracking-[0.14em] text-sage'
const field = 'rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-ink outline-none focus:border-gold'

export default function CreateOuting() {
  const router = useRouter()
  const [mode, setMode] = useState<'search' | 'manual'>('search')

  // shared
  const [playDate, setPlayDate] = useState(new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState<OutingFormat>('stroke')
  const [skins, setSkins] = useState(false)
  const [handicapMode, setHandicapMode] = useState<HandicapMode>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // search mode
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CourseSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<{ courseId: string; label: string; tees: TeeOption[] } | null>(null)
  const [teeId, setTeeId] = useState('')

  // manual mode
  const [courseName, setCourseName] = useState('')
  const [numHoles, setNumHoles] = useState<9 | 18>(18)
  const [pars, setPars] = useState<number[]>(Array(18).fill(4))

  async function runSearch() {
    setSearching(true)
    setError(null)
    setPicked(null)
    try {
      setResults(await searchCourses(query.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function pickCourse(r: CourseSearchResult) {
    setBusy(true)
    setError(null)
    try {
      const { courseId, tees } = await selectOrImportCourse(r)
      setPicked({ courseId, label: `${r.clubName} — ${r.courseName}`, tees })
      setTeeId(tees[0]?.teeId ?? '')
      setResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load course')
    } finally {
      setBusy(false)
    }
  }

  async function resolveCourseAndTee(session: { user: { id: string } }): Promise<{ courseId: string; teeId: string }> {
    if (mode === 'search') {
      if (!picked || !teeId) throw new Error('Pick a course and tee first')
      return { courseId: picked.courseId, teeId }
    }
    const { data: course, error: cErr } = await supabase
      .from('courses')
      .insert({ name: courseName.trim(), num_holes: numHoles, created_by: session.user.id })
      .select()
      .single()
    if (cErr) throw cErr
    const { data: tee, error: tErr } = await supabase
      .from('course_tees')
      .insert({ course_id: course.id, name: 'Default', par: pars.slice(0, numHoles) })
      .select()
      .single()
    if (tErr) throw tErr
    return { courseId: course.id, teeId: tee.id }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const session = await ensureSession()
      const { courseId, teeId: resolvedTeeId } = await resolveCourseAndTee(session)
      const { data: outing, error: oErr } = await supabase.rpc('create_outing', {
        p_course_id: courseId,
        p_tee_id: resolvedTeeId,
        p_play_date: playDate,
        p_format: format,
        p_skins: skins,
        p_handicap_mode: handicapMode,
      })
      if (oErr) throw oErr
      router.push(`/outing/${(outing as Outing).id}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  const canCreate = mode === 'search' ? !!picked && !!teeId : !!courseName.trim()

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <ScreenHeader title="New outing" meta="Set up the round" />

      <div className="flex gap-2">
        {(['search', 'manual'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null) }}
            className={`flex-1 rounded-[13px] border-[1.5px] py-2.5 text-sm font-medium ${
              mode === m ? 'border-pine bg-pine text-cream' : 'border-parch-2 bg-cream text-sage'
            }`}
          >
            {m === 'search' ? 'Search courses' : 'Enter manually'}
          </button>
        ))}
      </div>

      {mode === 'search' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) runSearch() }}
              placeholder="Pinehurst, Pebble Beach…"
              className={`${field} w-full`}
            />
            <button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="rounded-[13px] border-[1.5px] border-pine px-5 font-medium text-pine disabled:opacity-40"
            >
              {searching ? '…' : 'Find'}
            </button>
          </div>

          {results.map((r) => (
            <button
              key={r.externalId}
              onClick={() => pickCourse(r)}
              className="rounded-xl border border-parch-2 bg-cream p-3 text-left"
            >
              <p className="font-serif text-ink">{r.clubName || r.courseName}</p>
              <p className="text-xs text-sage">
                {[r.courseName, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}

          {picked && (
            <div className="flex flex-col gap-2 rounded-xl border border-gold bg-cream p-3">
              <p className="font-serif text-ink">{picked.label}</p>
              <label className="flex flex-col gap-1.5">
                <span className={label}>Tee</span>
                <select value={teeId} onChange={(e) => setTeeId(e.target.value)} className={field}>
                  {picked.tees.map((t) => (
                    <option key={t.teeId} value={t.teeId}>
                      {t.label} · {t.numHoles} holes{t.hasStrokeIndex ? '' : ' · no stroke index'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Course name</span>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="The Pines"
              className={`${field} font-serif text-lg placeholder:text-sage/40`}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Holes</span>
            <div className="flex gap-2">
              {([18, 9] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setNumHoles(n)}
                  className={`flex-1 rounded-[13px] border-[1.5px] py-3 font-medium ${
                    numHoles === n ? 'border-pine bg-pine text-cream' : 'border-parch-2 bg-cream text-sage'
                  }`}
                >
                  {n} holes
                </button>
              ))}
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className={`${label} mb-1`}>Par per hole</legend>
            <div className="grid grid-cols-6 gap-2">
              {pars.slice(0, numHoles).map((p, i) => (
                <label key={i} className="flex flex-col items-center gap-1 text-[10px] font-medium text-sage">
                  {i + 1}
                  <input
                    type="number"
                    min={3}
                    max={6}
                    value={p}
                    onChange={(e) => {
                      const next = [...pars]
                      next[i] = Number(e.target.value)
                      setPars(next)
                    }}
                    className="tnum w-full rounded-t-md border border-parch-2 border-b-2 border-b-gold bg-cream px-1 py-2 text-center font-serif text-lg text-pine outline-none focus:border-b-pine"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={label}>Date</span>
        <input type="date" value={playDate} onChange={(e) => setPlayDate(e.target.value)} className={field} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Format</span>
        <select value={format} onChange={(e) => setFormat(e.target.value as OutingFormat)} className={field}>
          <option value="stroke">Stroke play</option>
          <option value="scramble">Scramble</option>
        </select>
      </label>

      <label className="flex items-center justify-between rounded-[13px] border border-parch-2 bg-cream px-4 py-3">
        <span className="font-serif text-ink">Skins side game</span>
        <input type="checkbox" checked={skins} onChange={(e) => setSkins(e.target.checked)} className="h-5 w-5 accent-pine" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Handicaps</span>
        <select value={handicapMode} onChange={(e) => setHandicapMode(e.target.value as HandicapMode)} className={field}>
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || !canCreate} className="text-lg">
        {busy ? 'Creating…' : 'Create outing'}
      </Button>
    </main>
  )
}
