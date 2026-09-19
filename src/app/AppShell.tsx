import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarcodeIcon, CameraIcon, LedgerIcon, PersonIcon, ScaleIcon } from '@/components/Icons'
import { cn } from '@/lib/cn'
import { store } from '@/services/db'

/** Two tabs, the capture button, two tabs — a balanced native bar. */
const TABS = [
  { to: '/today', label: 'Today', icon: LedgerIcon },
  { to: '/weight', label: 'Weight', icon: ScaleIcon },
  null,
  { to: '/scan', label: 'Scan', icon: BarcodeIcon },
  { to: '/profile', label: 'Profile', icon: PersonIcon },
] as const

export function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const fullScreenFlow = pathname.startsWith('/add')
    || pathname.startsWith('/scan')
    || pathname.startsWith('/entry')

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col">
      {/* A note, not furniture: it scrolls away so it never covers a nav bar. */}
      {store.kind === 'local' && (
        <p className="px-4 py-1.5 text-center text-[0.74rem] text-[var(--color-ink-3)] pt-safe-0">
          Saving to this device only
        </p>
      )}

      <main className="flex-1 px-4 pb-8 pt-safe">
        <Outlet />
      </main>

      {/* Sticky rather than fixed, on purpose. A fixed bar is anchored to the
          layout viewport, so the moment somebody pinch-zooms it stops matching
          what they can actually see: it drifts over the content, or off the
          screen entirely, and pans away from the thumb. Sticky keeps it in the
          document, which means it behaves at any magnification. */}
      {!fullScreenFlow && (
        <nav
          aria-label="Main"
          className="glass hairline-t sticky bottom-0 z-40 mx-auto mt-auto w-full max-w-[560px]"
          style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="grid grid-cols-5 px-1 pt-1.5">
            {TABS.map((tab, index) =>
              tab === null ? (
                <div key="capture" className="relative">
                  {/* The camera is the product. It sits above the row, always
                      reachable, and never competes with a tab for its slot. */}
                  <button
                    type="button"
                    onClick={() => navigate('/add')}
                    aria-label="Photograph a meal"
                    className="press absolute -top-[26px] left-1/2 flex h-[54px] w-[54px] -translate-x-1/2 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-float)] ring-[3px] ring-[var(--color-canvas)]"
                  >
                    <CameraIcon size={24} strokeWidth={1.9} />
                  </button>
                </div>
              ) : (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) => cn(
                    'press-sm flex flex-col items-center gap-[3px] rounded-xl pb-2 pt-1 text-[0.66rem] font-medium tracking-[0.01em] transition-colors',
                    isActive ? 'text-[var(--color-tint)]' : 'text-[var(--color-ink-3)]',
                  )}
                  style={{ gridColumn: index + 1 }}
                >
                  {({ isActive }) => (
                    <>
                      <tab.icon size={25} strokeWidth={isActive ? 2 : 1.6} />
                      {tab.label}
                    </>
                  )}
                </NavLink>
              ),
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
