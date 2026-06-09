export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-[var(--surface)] rounded ${className}`} />
}

export function KBCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 p-3.5 sm:p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-7 h-7 rounded-lg" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <div className="flex gap-4 mt-1">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

export function PodcastRowSkeleton() {
  return (
    <div className="flex items-center gap-3 sm:gap-3.5 px-3 sm:px-[18px] py-3 sm:py-3.5 border-b border-[var(--border-soft)]">
      <Skeleton className="w-10 h-10 rounded-[var(--r-sm)] shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3.5 w-48 mb-1.5" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-3 w-12 hidden sm:block" />
    </div>
  )
}

export function PodcastDetailSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 pb-20 max-w-[820px] mx-auto">
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 mb-6">
          <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-[var(--r-lg)] shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-3 mt-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </div>
        <Skeleton className="h-10 w-full mb-6 rounded-[var(--r-lg)]" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 pb-20 max-w-[1280px] mx-auto">
        <div className="mb-9">
          <Skeleton className="h-3 w-40 mb-3" />
          <Skeleton className="h-9 w-96 max-w-full" />
        </div>
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="grid gap-3.5 mb-9 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {[0, 1, 2].map((i) => (
            <KBCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <PodcastRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function KBDetailSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 pb-20 max-w-[1280px] mx-auto">
        <Skeleton className="h-4 w-20 mb-4" />
        <div className="flex items-start gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-60" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="flex gap-1 mb-5 border-b border-[var(--border)] pb-0">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="w-10 h-10 rounded-[var(--r-sm)] shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-52 mb-1.5" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DiscoverSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 pb-20 max-w-[1280px] mx-auto">
        <Skeleton className="h-8 w-40 mb-6" />
        <div className="flex gap-2 mb-6 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
          ))}
        </div>
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
              <Skeleton className="w-16 h-16 rounded-[var(--r-sm)] shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
