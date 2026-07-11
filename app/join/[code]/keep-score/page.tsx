'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'

const label = 'text-xs font-medium uppercase tracking-[0.14em] text-sage'
const field =
  'rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-ink outline-none focus:border-gold'

export default function KeepScore({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groupName, setGroupName] = useState('')
  const [names, setNames] = useState<string[]>(['', ''])
  const [handicaps, setHandicaps] = useState<string[]>(['', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      await ensureSession()
      const { data } = await supabase.rpc('get_outing_by_code', { p_code: code })
      setOuting(data?.[0] ?? null)
    }
    load()
  }, [code])

  const withHandicaps = outing?.handicap_mode !== 'none'
  const validNames = names.map((n) => n.trim()).filter(Boolean)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { error: gErr } = await supabase.rpc('create_group', {
        p_share_code: code,
        p_name: groupName,
        p_player_names: validNames,
        p_handicaps: withHandicaps
          ? names.map((n, i) => (n.trim() ? Number(handicaps[i]) || 0 : null)).filter((h) => h !== null)
          : null,
      })
      if (gErr) throw gErr
      router.push(`/outing/${outing!.id}/score`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title="Your group" meta="Who's in your cart?" />

      <label className="flex flex-col gap-1.5">
        <span className={label}>Group name (optional)</span>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. The Hackers"
          className={`${field} font-serif text-lg placeholder:text-sage/40`}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={label}>Players</span>
        {names.map((n, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={n}
              onChange={(e) => {
                const next = [...names]
                next[i] = e.target.value
                setNames(next)
              }}
              placeholder={`Player ${i + 1}`}
              className={`${field} w-full`}
            />
            {withHandicaps && (
              <input
                value={handicaps[i]}
                onChange={(e) => {
                  const next = [...handicaps]
                  next[i] = e.target.value
                  setHandicaps(next)
                }}
                placeholder="HCP"
                inputMode="decimal"
                className="tnum w-20 rounded-[13px] border border-parch-2 border-b-2 border-b-gold bg-cream px-2 py-3 text-center font-serif text-lg text-pine outline-none focus:border-b-pine"
              />
            )}
          </div>
        ))}
        {names.length < 6 && (
          <button
            onClick={() => {
              setNames([...names, ''])
              setHandicaps([...handicaps, ''])
            }}
            className="self-start text-sm font-medium text-pine"
          >
            + Add player
          </button>
        )}
      </div>

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || validNames.length === 0} className="text-lg">
        {busy ? 'Joining…' : "We're in"}
      </Button>
    </main>
  )
}
