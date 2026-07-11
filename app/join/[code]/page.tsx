'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'

export default function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      await ensureSession()
      const { data } = await supabase.rpc('get_outing_by_code', { p_code: code })
      if (data && data.length > 0) setOuting(data[0])
      else setNotFound(true)
    }
    load()
  }, [code])

  if (notFound) return <main className="p-6 text-center text-sage">No outing found for code {code}.</main>
  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
      <div className="text-center">
        <div className="font-serif text-sm uppercase tracking-[0.42em] text-pine">Outter</div>
        <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
        <h1 className="mt-5 font-serif text-3xl text-ink">You’re invited</h1>
        <p className="mt-2 text-sm text-sage">Keep the card for your group, or just follow along.</p>
      </div>

      <Link
        href={`/join/${code}/keep-score`}
        className="rounded-[13px] bg-pine py-4 text-center text-lg font-medium text-cream active:scale-[0.98]"
      >
        Keep score for my group
      </Link>
      <Link
        href={`/outing/${outing.id}/watch`}
        className="rounded-[13px] border-[1.5px] border-pine py-4 text-center text-lg font-medium text-pine active:scale-[0.98]"
      >
        Just watch
      </Link>
    </main>
  )
}
