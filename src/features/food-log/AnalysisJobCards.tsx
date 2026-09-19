import { useNavigate } from 'react-router-dom'
import { STAGE_COPY, useAnalysisJobs, type AnalysisJob } from '@/app/analysis-jobs'
import { Button, IconButton, Spinner } from '@/components/Button'
import { CloseIcon, ImageIcon, PencilIcon, RefreshIcon } from '@/components/Icons'
import { draftsTotal, failureCopy } from '@/features/food-log/draft'
import { kcal } from '@/lib/format'

/**
 * A photo that is still being read, sitting on the day it belongs to.
 *
 * This is the whole point of doing the work in the background: the estimate
 * arrives here rather than behind a spinner you had to sit through, and it
 * stays here — unsaved, unclaimed — until you open it.
 */
export function AnalysisJobCards({ date }: { date: string }) {
  const { jobs } = useAnalysisJobs()
  const mine = jobs.filter((job) => job.consumedOn === date)
  if (!mine.length) return null

  return (
    <section aria-label="Photos being read" className="mt-4 flex flex-col gap-2.5">
      {mine.map((job) => <JobCard key={job.id} job={job} />)}
    </section>
  )
}

function JobCard({ job }: { job: AnalysisJob }) {
  const navigate = useNavigate()
  const { retry, discard } = useAnalysisJobs()

  const stage = job.stage
  const working = stage === 'preparing' || stage === 'uploading' || stage === 'analyzing'
  // An answer with nothing in it is a failure whatever it calls itself; the
  // card below reads `foods[0]`, and a hopeful cast is not worth a crash.
  const hasFoods = (job.draft?.foods.length ?? 0) > 0
  const modelFailed = stage === 'ready' && (job.draft?.status === 'failed' || !hasFoods)
  const broke = stage === 'failed'
  const ready = stage === 'ready' && !modelFailed

  const total = job.draft?.foods.length ? draftsTotal(job.draft.foods) : null
  const copy = modelFailed
    ? failureCopy(job.draft?.failure_code ?? null, job.draft?.retry_after_seconds)
    : null

  return (
    <article className="card fade-in overflow-hidden">
      <div className="flex items-center gap-3.5 p-3.5">
        <Thumb url={job.previewUrl} dim={working} />

        <div className="min-w-0 flex-1">
          {working && (
            <>
              <p className="truncate text-[0.98rem] font-semibold">{STAGE_COPY[stage]}</p>
              <p className="mt-0.5 text-[0.82rem] leading-snug text-[var(--color-ink-3)]">
                Keep using the app — this finishes on its own.
              </p>
            </>
          )}

          {ready && (
            <>
              <p className="truncate text-[0.98rem] font-semibold">
                {job.draft!.foods.length === 1
                  ? job.draft!.foods[0].name || 'One food'
                  : `${job.draft!.foods.length} foods`}
              </p>
              <p className="tnum mt-0.5 text-[0.82rem] text-[var(--color-ink-2)]">
                About {kcal(total?.calories_kcal ?? 0)} kcal · nothing logged yet
              </p>
            </>
          )}

          {modelFailed && (
            <>
              <p className="truncate text-[0.98rem] font-semibold">{copy!.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[0.82rem] leading-snug text-[var(--color-ink-2)]">
                {copy!.body}
              </p>
            </>
          )}

          {broke && (
            <>
              <p className="truncate text-[0.98rem] font-semibold">That photo did not go through</p>
              <p className="mt-0.5 line-clamp-2 text-[0.82rem] leading-snug text-[var(--color-ink-2)]">
                {job.error}
              </p>
            </>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-1.5">
          {working ? (
            <span className="grid h-[36px] w-[36px] place-items-center text-[var(--color-ink-3)]">
              <Spinner />
            </span>
          ) : ready ? (
            <Button size="sm" variant="primary" onClick={() => navigate(`/add?job=${job.id}`)}>
              Review
            </Button>
          ) : null}
          {!working && (
            <IconButton
              label="Discard this photo"
              className="hover:text-[var(--color-critical)]"
              onClick={() => discard(job.id)}
            >
              <CloseIcon size={17} strokeWidth={2.2} />
            </IconButton>
          )}
        </span>
      </div>

      {working && (
        <div className="h-[3px] w-full overflow-hidden bg-[var(--color-track)]" aria-hidden="true">
          <span className="job-sweep block h-full w-1/3 bg-[var(--color-tint)]" />
        </div>
      )}

      {(modelFailed || broke) && (
        <div className="hairline-t flex flex-wrap gap-2 px-3.5 py-3">
          <Button size="sm" icon={<RefreshIcon size={15} />} onClick={() => retry(job.id)}>
            Try again
          </Button>
          <Button
            size="sm" icon={<PencilIcon size={15} />}
            onClick={() => navigate(`/add?job=${job.id}`)}
          >
            Describe it myself
          </Button>
        </div>
      )}
    </article>
  )
}

function Thumb({ url, dim }: { url: string | null; dim: boolean }) {
  return (
    <span
      className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[var(--color-fill)] text-[var(--color-ink-3)]"
      aria-hidden="true"
    >
      {url ? (
        <img
          src={url} alt=""
          className="h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: dim ? 0.6 : 1 }}
        />
      ) : (
        <ImageIcon size={20} />
      )}
    </span>
  )
}
