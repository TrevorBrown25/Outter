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

  if (notFound) return <main className="p-6 text-center">No outing found for code {code}.</main>
  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold">You’re invited ⛳</h1>
      <Link
        href={`/join/${code}/keep-score`}
        className="rounded-xl bg-green-700 py-4 text-center text-lg font-semibold text-white"
      >
        Keep score for my group
      </Link>
      <Link
        href={`/outing/${outing.id}/watch`}
        className="rounded-xl border py-4 text-center text-lg font-semibold"
      >
        Just watch
      </Link>
    </main>
  )
}
