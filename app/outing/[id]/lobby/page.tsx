'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'

export default function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [joinUrl, setJoinUrl] = useState('')
  const [uid, setUid] = useState<string | null>(null)

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
      const session = await ensureSession()
      setUid(session.user.id)
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

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <ScreenHeader title="Lobby" meta="Share to fill the field" />

      <div className="flex flex-col items-center gap-4 rounded-xl border border-parch-2 bg-cream p-5">
        {joinUrl && (
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={joinUrl} size={188} bgColor="#FFFFFF" fgColor="#0E4429" />
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-sage">Share code</span>
          <p
            data-testid="share-code"
            className="pl-[0.3em] font-serif text-4xl tracking-[0.3em] text-pine"
          >
            {outing.share_code}
          </p>
        </div>
        <p className="text-center text-sm text-sage">Scan to keep score for your group — or just watch</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg text-ink">Groups ({groups.length})</h2>
        {groups.length === 0 && <p className="text-sm text-sage">Waiting for scorekeepers to join…</p>}
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-parch-2 bg-cream p-4">
            <p className="font-serif text-ink">{g.name}</p>
            <p className="mt-0.5 text-sm text-sage">
              {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
            </p>
          </div>
        ))}
      </section>

      {outing.organizer_id === uid && outing.status === 'setup' && (
        <button
          onClick={async () => {
            await supabase.from('outings').update({ status: 'live' }).eq('id', outing.id)
            window.location.href = `/outing/${outing.id}/watch`
          }}
          disabled={groups.length === 0}
          className="rounded-[13px] bg-pine py-4 text-center text-lg font-medium text-cream active:scale-[0.98] disabled:opacity-40"
        >
          Start round
        </button>
      )}
      {outing.status !== 'setup' && (
        <Link href={`/outing/${outing.id}/watch`} className="text-center text-sm font-medium text-pine">
          Round in progress — view leaderboard
        </Link>
      )}
    </main>
  )
}
