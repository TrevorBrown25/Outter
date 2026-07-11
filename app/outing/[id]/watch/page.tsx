'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'
import { toPar } from '@/src/components/score'
import { computeStrokeLeaderboard, type ScoreInput } from '@/src/lib/scoring/stroke'

interface ScoreRow { player_id: string | null; hole_number: number; strokes: number }

export default function Watch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [uid, setUid] = useState<string | null>(null)

  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = []

    async function refresh() {
      const [{ data: g }, { data: p }, { data: s }, { data: o }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
        supabase.from('scores').select('player_id,hole_number,strokes').eq('outing_id', id),
        supabase.from('outings').select().eq('id', id).single(),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
      setScores(s ?? [])
      if (o) setOuting(o)
    }

    async function load() {
      const session = await ensureSession()
      setUid(session.user.id)
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      await refresh()
      // one channel per table — multiple postgres_changes on a single channel silently drop events
      for (const [name, table, filter] of [
        ['scores', 'scores', `outing_id=eq.${id}`],
        ['players', 'players', `outing_id=eq.${id}`],
        ['outing', 'outings', `id=eq.${id}`],
      ] as const) {
        const ch = supabase
          .channel(`watch-${name}-${id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table, filter }, refresh)
          .subscribe()
        channels.push(ch)
      }
    }

    load()
    return () => { channels.forEach((c) => supabase.removeChannel(c)) }
  }, [id])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  const rows = useMemo(() => {
    if (!outing) return []
    const scoreInputs: ScoreInput[] = scores
      .filter((s) => s.player_id)
      .map((s) => ({ playerId: s.player_id!, holeNumber: s.hole_number, strokes: s.strokes }))
    return computeStrokeLeaderboard({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.display_name,
        groupName: groupName.get(p.group_id),
        handicapIndex: p.handicap_index,
      })),
      scores: scoreInputs,
      par: outing.par_snapshot,
      strokeIndex: outing.stroke_index_snapshot,
      handicapMode: outing.handicap_mode,
    })
  }, [outing, players, scores, groupName])

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  const useNet = outing.handicap_mode !== 'none'
  const numHoles = outing.par_snapshot.length
  const isFinal = outing.status === 'final'
  const isOrganizer = outing.organizer_id === uid

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title={isFinal ? 'Final results' : 'Leaderboard'} meta={useNet ? 'Net · stroke play' : 'Gross · stroke play'} />

      <div className="overflow-hidden rounded-xl border border-parch-2">
        <div className="grid grid-cols-[28px_1fr_38px_48px] gap-2 bg-pine-deep px-3 py-2.5 text-[10px] uppercase tracking-[0.1em] text-gold-soft">
          <span>Pos</span>
          <span>Player</span>
          <span className="text-right">Thru</span>
          <span className="text-right">{useNet ? 'Net' : 'Par'}</span>
        </div>
        {rows.length === 0 && <p className="bg-cream px-3 py-5 text-center text-sm text-sage">No scores yet.</p>}
        {rows.map((r, i) => {
          const tp = toPar(r.toPar)
          const leader = i === 0 && r.thru > 0
          return (
            <div
              key={r.playerId}
              className={`grid grid-cols-[28px_1fr_38px_48px] items-center gap-2 border-t border-parch-2 px-3 py-3 ${leader && isFinal ? 'bg-[#EDE5CE]' : 'bg-cream'}`}
            >
              <span className="font-serif text-sage">{r.thru > 0 ? i + 1 : '–'}</span>
              <span className="text-ink">
                {isFinal && leader && <span className="mr-1 text-gold">★</span>}
                {r.displayName}
                {r.groupName && <span className="block text-xs text-sage">{r.groupName}</span>}
              </span>
              <span className="tnum text-right text-xs text-sage">
                {r.thru === 0 ? '–' : r.thru === numHoles ? 'F' : r.thru}
              </span>
              <span className={`tnum text-right font-serif text-xl ${r.thru > 0 ? tp.className : 'text-sage'}`}>
                {r.thru > 0 ? tp.label : '–'}
              </span>
            </div>
          )
        })}
      </div>

      {useNet && (
        <p className="text-center text-xs text-sage">
          Net shown. {outing.stroke_index_snapshot ? 'Strokes allocated by hole.' : 'Simple net (no stroke index).'}
        </p>
      )}

      {isOrganizer && outing.status === 'live' && (
        <button
          onClick={async () => {
            await supabase.from('outings').update({ status: 'final' }).eq('id', outing.id)
          }}
          className="rounded-[13px] border-[1.5px] border-pine py-3 text-center font-medium text-pine active:scale-[0.98]"
        >
          End round · post final
        </button>
      )}

      <Link href={`/outing/${id}/score`} className="text-center text-sm font-medium text-pine">
        Keeping score? Enter strokes
      </Link>
    </main>
  )
}
