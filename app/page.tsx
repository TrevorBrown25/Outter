'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Landing() {
  const [code, setCode] = useState('')
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="font-serif text-4xl uppercase tracking-[0.30em] text-pine">Outter</div>
        <div className="text-sm text-gold">est. on the first tee.</div>
        <div className="mx-auto mt-4 mb-[150px] h-0.5 w-14 bg-gold" />
        <p className="font-serif text-lg leading-snug text-ink">
          Organize the round.<br />Track every stroke.<br />Settle the skins.
        </p>
      </div>

      <Link
        href="/create"
        className="rounded-[13px] bg-pine py-4 text-center text-xl font-medium text-cream active:scale-[0.98]"
      >
        Create an outing
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 6) router.push(`/join/${code.trim().toUpperCase()}`)
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-center text-xs uppercase tracking-[0.16em] text-sage">
          or enter a 6-digit code
        </p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7K4Q2M"
            maxLength={6}
            className="w-full rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-center font-serif text-xl tracking-[0.3em] text-pine placeholder:text-sage/50 focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={code.trim().length !== 6}
            className="rounded-[13px] border-[1.5px] border-pine px-5 font-medium text-pine disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </form>
    </main>
  )
}
