import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Profile } from '@/types/domain'
import { store, type AppUser } from '@/services/db'
import { detectTimezone, todayIn } from '@/lib/dates'

interface SessionValue {
  user: AppUser | null
  profile: Profile | null
  /** True until we know whether anyone is signed in. */
  loading: boolean
  profileLoading: boolean
  timezone: string
  /** The user's local calendar date — recomputed as the clock passes midnight. */
  today: string
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [clockTick, setClockTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    store.getUser().then((current) => {
      if (cancelled) return
      setUser(current)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    const unsubscribe = store.onAuthChange((next) => {
      setUser(next)
      setLoading(false)
      // Reset rather than clear: clearing detaches the mounted observers and
      // leaves them pending forever, and one account must never see another's
      // cached day.
      queryClient.resetQueries()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [queryClient])

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => store.getProfile(user!.id),
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  const timezone = profile?.timezone || detectTimezone()
  const today = useMemo(() => todayIn(timezone), [timezone, clockTick])

  // Cross midnight while the app is open and "today" follows.
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 60_000)
    const onVisible = () => setClockTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const value = useMemo<SessionValue>(() => ({
    user,
    profile: profile ?? null,
    loading,
    profileLoading: Boolean(user) && profileLoading,
    timezone,
    today,
    async signOut() {
      await store.signOut()
      setUser(null)
      queryClient.resetQueries()
    },
  }), [user, profile, loading, profileLoading, timezone, today, queryClient])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}

/** For the many places that simply cannot run without a signed-in user. */
export function useUserId(): string {
  const { user } = useSession()
  if (!user) throw new Error('No signed-in user')
  return user.id
}
