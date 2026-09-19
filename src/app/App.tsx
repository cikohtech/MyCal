import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
import { useSession } from '@/app/session'
import { AppShell } from '@/app/AppShell'
import { Spinner } from '@/components/Button'
import { SignIn } from '@/features/auth/SignIn'
import { AuthConfirm } from '@/features/auth/AuthConfirm'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { UpdatePrompt } from '@/app/UpdatePrompt'

// Today is the screen people open; everything else arrives on demand, so the
// first paint on a phone carries only what it needs.
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding').then((m) => ({ default: m.Onboarding })))
const AddFood = lazy(() => import('@/features/food-log/AddFood').then((m) => ({ default: m.AddFood })))
const EntryEditor = lazy(() => import('@/features/food-log/EntryEditor').then((m) => ({ default: m.EntryEditor })))
const ScanBarcode = lazy(() => import('@/features/barcode/ScanBarcode').then((m) => ({ default: m.ScanBarcode })))
const Weight = lazy(() => import('@/features/weight/Weight').then((m) => ({ default: m.Weight })))
const Profile = lazy(() => import('@/features/profile/Profile').then((m) => ({ default: m.Profile })))

function Loading() {
  return (
    <div className="grid min-h-[100dvh] place-items-center text-[var(--color-ink-3)]">
      <Spinner />
    </div>
  )
}

/** Signed out goes to the front door; signed in but unset-up goes to setup. */
function RequireSetup({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoading } = useSession()
  const location = useLocation()

  if (loading || profileLoading) return <Loading />
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />
  if (!profile) return <Navigate to="/setup" replace />
  return <>{children}</>
}

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

function Front() {
  const { user, profile, loading, profileLoading } = useSession()
  if (loading || (user && profileLoading)) return <Loading />
  if (user) return <Navigate to={profile ? '/today' : '/setup'} replace />
  return <SignIn />
}

export function App() {
  return (
    <>
      <UpdatePrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Front />} />
          {/* Where every mailed link lands, signed in or not. */}
          <Route path="/auth/confirm" element={<AuthConfirm />} />
          <Route path="/setup" element={<RequireUser><Onboarding /></RequireUser>} />
          <Route element={<RequireSetup><AppShell /></RequireSetup>}>
            <Route path="/today" element={<Dashboard />} />
            <Route path="/add" element={<AddFood />} />
            <Route path="/scan" element={<ScanBarcode />} />
            <Route path="/entry/:id" element={<EntryEditor />} />
            <Route path="/weight" element={<Weight />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
