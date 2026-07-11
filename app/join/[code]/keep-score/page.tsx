'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'

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
      router.push(`/outing/${outing!.id}/watch`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Your group</h1>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Group name (optional)</span>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. The Hackers"
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <span className="text-sm font-medium">Players</span>
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
            className="w-full rounded-lg border px-3 py-2"
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
              className="w-20 rounded-lg border px-2 py-2 text-center"
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
          className="self-start text-sm font-semibold text-green-700"
        >
          + Add player
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || validNames.length === 0}
        className="rounded-xl bg-green-700 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Joining…' : "We're in"}
      </button>
    </main>
  )
}
