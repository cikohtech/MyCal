import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/Button'

/**
 * A new build is offered, never forced — being mid-way through logging a meal
 * and having the page reload underneath you would lose the draft.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[70] mx-auto w-full max-w-[560px] px-4 pt-safe">
      <div className="rise glass mt-2 flex items-center gap-2 rounded-[16px] px-4 py-3 shadow-[var(--shadow-float)]">
        <p className="min-w-0 flex-1 text-[0.88rem] leading-snug">
          A newer version of My Cal is ready.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
        <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
      </div>
    </div>
  )
}
