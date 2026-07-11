import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Parchment page wrapper, phone-first max width, centered. */
export function AppShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-6">{children}</main>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

/** Primary = pine fill; ghost = pine outline. Radius/weight per design-config. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'rounded-[13px] py-4 text-center text-base font-medium transition-transform active:scale-[0.98] disabled:opacity-40'
  const style =
    variant === 'primary'
      ? 'bg-pine text-cream'
      : 'border-[1.5px] border-pine text-pine'
  return <button className={`${base} ${style} ${className}`} {...props} />
}

/** Deep-green header panel: serif title + gold-soft uppercase meta. */
export function ScreenHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="-mx-6 -mt-6 bg-pine px-6 pb-5 pt-8 text-cream">
      <h1 className="font-serif text-2xl">{title}</h1>
      {meta && <p className="mt-1 text-xs uppercase tracking-[0.12em] text-gold-soft">{meta}</p>}
    </div>
  )
}
