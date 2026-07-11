'use client'
import { use, useEffect, useState } from 'react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'

export default function Watch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
    }

    async function load() {
      await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      await refresh()
      channel = supabase
        .channel(`watch-${id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'groups', filter: `outing_id=eq.${id}` },
          refresh)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` },
          refresh)
        .subscribe()
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title="Leaderboard" meta="The field" />
      <p className="text-sm text-sage">Live scoring lands next — here’s who’s playing:</p>
      {groups.map((g) => (
        <div key={g.id} className="rounded-xl border border-parch-2 bg-cream p-4">
          <p className="font-serif text-ink">{g.name}</p>
          <p className="mt-0.5 text-sm text-sage">
            {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
          </p>
        </div>
      ))}
    </main>
  )
}
