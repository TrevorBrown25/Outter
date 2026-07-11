'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'

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
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">New outing</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Course name</span>
        <input
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <div className="flex gap-2">
        {([9, 18] as const).map((n) => (
          <button
            key={n}
            onClick={() => setNumHoles(n)}
            className={`flex-1 rounded-lg border py-2 font-semibold ${numHoles === n ? 'bg-green-700 text-white' : ''}`}
          >
            {n} holes
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Par per hole</legend>
        <div className="grid grid-cols-6 gap-1">
          {pars.slice(0, numHoles).map((p, i) => (
            <label key={i} className="flex flex-col items-center text-xs">
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
                className="w-full rounded border px-1 py-1 text-center"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date</span>
        <input
          type="date"
          value={playDate}
          onChange={(e) => setPlayDate(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Format</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as OutingFormat)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="stroke">Stroke play</option>
          <option value="scramble">Scramble</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={skins} onChange={(e) => setSkins(e.target.checked)} />
        <span>Skins side game</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Handicaps</span>
        <select
          value={handicapMode}
          onChange={(e) => setHandicapMode(e.target.value as HandicapMode)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !courseName.trim()}
        className="rounded-xl bg-green-700 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create outing'}
      </button>
    </main>
  )
}
