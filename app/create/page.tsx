'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'

const label = 'text-xs font-medium uppercase tracking-[0.14em] text-sage'
const field =
  'rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-ink outline-none focus:border-gold'

export default function CreateOuting() {
  const router = useRouter()
  const [courseName, setCourseName] = useState('')
  const [numHoles, setNumHoles] = useState<9 | 18>(18)
  const [pars, setPars] = useState<number[]>(Array(18).fill(4))
  const [playDate, setPlayDate] = useState(new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState<OutingFormat>('stroke')
  const [skins, setSkins] = useState(false)
  const [handicapMode, setHandicapMode] = useState<HandicapMode>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const session = await ensureSession()
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
      const { data: outing, error: oErr } = await supabase.rpc('create_outing', {
        p_course_id: course.id,
        p_tee_id: tee.id,
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

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <ScreenHeader title="New outing" meta="Set up the round" />

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
              className={`flex-1 rounded-[13px] border-[1.5px] py-3 font-medium transition-colors ${
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
        <input
          type="checkbox"
          checked={skins}
          onChange={(e) => setSkins(e.target.checked)}
          className="h-5 w-5 accent-pine"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Handicaps</span>
        <select
          value={handicapMode}
          onChange={(e) => setHandicapMode(e.target.value as HandicapMode)}
          className={field}
        >
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || !courseName.trim()} className="text-lg">
        {busy ? 'Creating…' : 'Create outing'}
      </Button>
    </main>
  )
}
