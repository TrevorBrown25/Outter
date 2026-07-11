'use client'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'
import { allocateStrokes } from '@/src/lib/scoring/allocate'

export default function Score({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [strokes, setStrokes] = useState<Record<string, Record<number, number>>>({})
  const [hole, setHole] = useState(1)
  const [notScorekeeper, setNotScorekeeper] = useState(false)

  useEffect(() => {
    async function load() {
      const session = await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      const { data: g } = await supabase
        .from('groups')
        .select()
        .eq('outing_id', id)
        .eq('scorekeeper_user_id', session.user.id)
        .maybeSingle()
      if (!g) {
        setNotScorekeeper(true)
        return
      }
      setGroup(g)
      const { data: p } = await supabase.from('players').select().eq('group_id', g.id).order('created_at')
      setPlayers(p ?? [])
      const { data: s } = await supabase.from('scores').select().eq('outing_id', id)
      const map: Record<string, Record<number, number>> = {}
      for (const row of s ?? []) {
        if (!row.player_id) continue
        map[row.player_id] ??= {}
        map[row.player_id][row.hole_number] = row.strokes
      }
      setStrokes(map)
    }
    load()
  }, [id])

  const par = outing?.par_snapshot ?? []
  const numHoles = par.length
  const holePar = par[hole - 1] ?? 4
  const strokeIndex = outing?.stroke_index_snapshot ?? null
  const holeSi = strokeIndex ? strokeIndex[hole - 1] : null
  const isFinal = outing?.status === 'final'
  const useHandicaps = outing?.handicap_mode !== 'none'

  // strokes each player receives on the current hole (for the "gets a shot" dot)
  const shotsThisHole = useMemo(() => {
    const m: Record<string, number> = {}
    if (!useHandicaps || !strokeIndex) return m
    for (const pl of players) {
      if (pl.handicap_index == null) continue
      m[pl.id] = allocateStrokes(pl.handicap_index, strokeIndex)[hole - 1]
    }
    return m
  }, [players, strokeIndex, useHandicaps, hole])

  const setStroke = useCallback(
    async (playerId: string, value: number) => {
      const v = Math.max(1, Math.min(20, value))
      setStrokes((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [hole]: v } }))
      const session = await ensureSession()
      await supabase.from('scores').upsert(
        { outing_id: id, hole_number: hole, player_id: playerId, strokes: v, entered_by: session.user.id },
        { onConflict: 'outing_id,hole_number,player_id,group_id' },
      )
    },
    [hole, id],
  )

  if (notScorekeeper) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
        <ScreenHeader title="Scoring" meta="Not your card" />
        <p className="text-sm text-sage">You’re not the scorekeeper for a group in this outing.</p>
        <Link href={`/outing/${id}/watch`} className="font-medium text-pine">
          View the leaderboard →
        </Link>
      </main>
    )
  }
  if (!outing || !group) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title={`Hole ${hole} · Par ${holePar}`} meta={holeSi ? `Stroke index ${holeSi} · ${group.name}` : group.name} />

      {outing.format !== 'stroke' && (
        <p className="rounded-lg bg-cream px-3 py-2 text-xs text-sage">
          {outing.format === 'scramble' ? 'Scramble' : 'This format'} scoring is coming soon — entering per-player strokes for now.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {players.map((pl) => {
          const val = strokes[pl.id]?.[hole] ?? holePar
          const shots = shotsThisHole[pl.id] ?? 0
          return (
            <div key={pl.id} className="flex items-center justify-between rounded-xl border border-parch-2 bg-cream p-3">
              <div className="flex flex-col">
                <span className="font-serif text-lg text-ink">{pl.display_name}</span>
                {shots > 0 && (
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
                    {shots === 1 ? 'gets a shot' : `gets ${shots} shots`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  aria-label={`one fewer for ${pl.display_name}`}
                  disabled={isFinal}
                  onClick={() => setStroke(pl.id, val - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-pine font-serif text-2xl text-pine active:scale-95 disabled:opacity-40"
                >
                  −
                </button>
                <span className="tnum w-10 text-center font-serif text-4xl text-ink">{val}</span>
                <button
                  aria-label={`one more for ${pl.display_name}`}
                  disabled={isFinal}
                  onClick={() => setStroke(pl.id, val + 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-pine font-serif text-2xl text-pine active:scale-95 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {isFinal && <p className="text-center text-sm text-sage">This round is final — scoring is closed.</p>}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setHole((h) => Math.max(1, h - 1))}
          disabled={hole === 1}
          className="rounded-[13px] border-[1.5px] border-pine px-5 py-2.5 font-medium text-pine disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="tnum text-sm text-sage">
          {hole} / {numHoles}
        </span>
        <button
          onClick={() => setHole((h) => Math.min(numHoles, h + 1))}
          disabled={hole === numHoles}
          className="rounded-[13px] border-[1.5px] border-pine px-5 py-2.5 font-medium text-pine disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <Link href={`/outing/${id}/watch`} className="text-center text-sm font-medium text-pine">
        View leaderboard
      </Link>
    </main>
  )
}
