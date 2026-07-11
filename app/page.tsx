'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Landing() {
  const [code, setCode] = useState('')
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-3xl font-bold">⛳ Outter</h1>
      <Link
        href="/create"
        className="rounded-xl bg-green-700 py-4 text-center text-lg font-semibold text-white"
      >
        Create an outing
      </Link>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 6) router.push(`/join/${code.trim().toUpperCase()}`)
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="6-char code"
          maxLength={6}
          className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-widest"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 6}
          className="rounded-xl border px-5 font-semibold disabled:opacity-40"
        >
          Join
        </button>
      </form>
    </main>
  )
}
