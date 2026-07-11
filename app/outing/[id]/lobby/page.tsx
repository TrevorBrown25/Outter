'use client'
import { use, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'

export default function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [joinUrl, setJoinUrl] = useState('')

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
      if (o) setJoinUrl(`${window.location.origin}/join/${o.share_code}`)
      await refresh()
      channel = supabase
        .channel(`lobby-${id}`)
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

  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Lobby</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border p-4">
        {joinUrl && <QRCodeSVG value={joinUrl} size={200} />}
        <p className="text-3xl font-mono font-bold tracking-widest">{outing.share_code}</p>
        <p className="text-center text-sm text-gray-500">
          Scan to keep score for your group — or just watch
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Groups ({groups.length})</h2>
        {groups.length === 0 && (
          <p className="text-sm text-gray-500">Waiting for scorekeepers to join…</p>
        )}
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border p-3">
            <p className="font-semibold">{g.name}</p>
            <p className="text-sm text-gray-600">
              {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
