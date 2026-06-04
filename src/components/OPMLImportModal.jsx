import { useState, useRef } from 'react'
import { parseOPML, readFileAsText } from '../lib/opml'
import { resolveFeeds, getEpisodes } from '../services/podcastIndex'
import { subscribe } from '../services/subscriptions'
import { bulkAddEpisodesFromIndex } from '../services/podcasts'
import * as Icons from './Icons'

const RECENT_OPTIONS = [
  { label: 'None (subscribe only)', value: 0 },
  { label: 'Recent 10 episodes', value: 10 },
  { label: 'Recent 20 episodes', value: 20 },
  { label: 'Recent 50 episodes', value: 50 },
]

export default function OPMLImportModal({ onClose }) {
  const [step, setStep] = useState('upload')
  const [feeds, setFeeds] = useState([])
  const [resolved, setResolved] = useState([])
  const [unresolvedUrls, setUnresolvedUrls] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [recentCount, setRecentCount] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    try {
      const text = await readFileAsText(file)
      const parsed = parseOPML(text)
      if (parsed.length === 0) {
        setError('No podcast feeds found in this file')
        return
      }
      setFeeds(parsed)
      setResolving(true)
      setStep('review')

      const feedUrls = parsed.map(f => f.feedUrl)
      const BATCH = 50
      const allResults = []
      const allUnresolved = []

      for (let i = 0; i < feedUrls.length; i += BATCH) {
        const batch = feedUrls.slice(i, i + BATCH)
        const { results, unresolved } = await resolveFeeds(batch)
        allResults.push(...results)
        allUnresolved.push(...unresolved)
      }

      setResolved(allResults)
      setUnresolvedUrls(allUnresolved)
      setSelected(new Set(allResults.map(r => r.feedId)))
    } catch (err) {
      setError(err.message || 'Failed to parse OPML file')
    } finally {
      setResolving(false)
    }
  }

  function toggleFeed(feedId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(feedId)) next.delete(feedId)
      else next.add(feedId)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === resolved.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(resolved.map(r => r.feedId)))
    }
  }

  async function handleImport() {
    const toImport = resolved.filter(r => selected.has(r.feedId))
    if (toImport.length === 0) return

    setImporting(true)
    setStep('importing')
    setError('')

    let subscribed = 0
    let episodesAdded = 0

    for (let i = 0; i < toImport.length; i++) {
      const feed = toImport[i]
      setProgress({
        phase: 'subscribing',
        current: i + 1,
        total: toImport.length,
        feedTitle: feed.title,
        subscribed,
        episodesAdded,
      })

      try {
        await subscribe({
          id: feed.feedId,
          feedUrl: feed.feedUrl,
          title: feed.title,
          author: feed.author,
          artwork: feed.artwork,
        })
        subscribed++
      } catch {
        // already subscribed or error — continue
      }

      if (recentCount > 0) {
        try {
          const { episodes } = await getEpisodes(feed.feedId, feed.feedUrl, { max: recentCount })
          if (episodes.length > 0) {
            const showMetadata = {
              title: feed.title,
              artwork: feed.artwork,
              feedUrl: feed.feedUrl,
              feedId: feed.feedId,
            }
            const result = await bulkAddEpisodesFromIndex(null, episodes, showMetadata)
            episodesAdded += result.added
          }
        } catch {
          // continue on error
        }
      }
    }

    setProgress({
      phase: 'done',
      current: toImport.length,
      total: toImport.length,
      subscribed,
      episodesAdded,
    })

    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
    setImporting(false)
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/55 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] flex flex-col fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[12px_12px_var(--r-lg)_var(--r-lg)]"
      >
        {/* Header */}
        <div className="flex items-center px-[18px] py-3.5 shrink-0 border-b border-[var(--border)]">
          <h3 className="m-0 text-[15px] font-medium flex-1">Import OPML</h3>
          <button onClick={onClose} className="ml-auto mute shrink-0">
            <Icons.X size={16} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 px-[18px] py-3.5">
          {/* Upload step */}
          {step === 'upload' && (
            <>
              <p className="text-[13px] dim mb-4 m-0">
                Import podcast subscriptions from any podcast app. Export your subscriptions
                as OPML, then upload the file here.
              </p>

              {error && (
                <p className="text-[12px] mb-3 text-[var(--error)]">{error}</p>
              )}

              <label className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-[var(--border)] rounded-[var(--r-lg)] cursor-pointer transition-colors hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)] hover:bg-[var(--surface)]">
                <Icons.Download size={24} className="mute" />
                <span className="text-[13px] font-medium">Choose .opml or .xml file</span>
                <span className="text-[11px] mute">or drag and drop</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".opml,.xml,text/xml,application/xml"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </>
          )}

          {/* Review step */}
          {step === 'review' && (
            <>
              {resolving ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="w-5 h-5 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
                  <span className="text-[13px] mute">
                    Resolving {feeds.length} feeds on Podcast Index...
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <p className="text-[12px] dim m-0">
                      {resolved.length} found · {unresolvedUrls.length} not on Podcast Index
                    </p>
                    <button
                      onClick={toggleAll}
                      className="text-[11px] font-medium text-[var(--accent)]"
                    >
                      {selected.size === resolved.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  {error && (
                    <p className="text-[12px] mb-2 text-[var(--error)]">{error}</p>
                  )}

                  <div className="flex-1 overflow-y-auto min-h-0 space-y-1 mb-3">
                    {resolved.map(feed => (
                      <label
                        key={feed.feedId}
                        className="flex items-center gap-3 p-2.5 rounded-[var(--r-md)] cursor-pointer transition-colors hover:bg-[var(--surface)]"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(feed.feedId)}
                          onChange={() => toggleFeed(feed.feedId)}
                          className="w-3.5 h-3.5 accent-[var(--accent)] shrink-0"
                        />
                        {feed.artwork && (
                          <img
                            src={feed.artwork}
                            alt=""
                            className="w-9 h-9 rounded-[var(--r-sm)] object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate m-0">{feed.title}</p>
                          <p className="text-[11px] mute m-0 mt-0.5">
                            {feed.author}
                            {feed.episodeCount ? ` · ${feed.episodeCount} episodes` : ''}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Import options + button */}
                  <div className="shrink-0 pt-3 border-t border-[var(--border)] space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] dim">Also import:</span>
                      <select
                        value={recentCount}
                        onChange={e => setRecentCount(Number(e.target.value))}
                        className="text-[12px] px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] text-[var(--text)]"
                      >
                        {RECENT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleImport}
                      disabled={selected.size === 0}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)] transition-colors disabled:opacity-50 min-h-[40px]"
                    >
                      Import {selected.size} feed{selected.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Importing step */}
          {step === 'importing' && progress && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {progress.phase === 'done' ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-faint)] flex items-center justify-center">
                    <Icons.Check size={20} className="text-[var(--accent)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-medium m-0 mb-1">Import complete</p>
                    <p className="text-[13px] dim m-0">
                      {progress.subscribed} feed{progress.subscribed !== 1 ? 's' : ''} subscribed
                      {progress.episodesAdded > 0 && (
                        <> · {progress.episodesAdded} episode{progress.episodesAdded !== 1 ? 's' : ''} added</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-5 py-2 text-[13px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)]"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium m-0 mb-1">
                      Importing {progress.current} / {progress.total}
                    </p>
                    <p className="text-[12px] mute m-0 truncate max-w-[300px]">
                      {progress.feedTitle}
                    </p>
                  </div>
                  <div className="w-full max-w-[300px] h-1.5 rounded-full overflow-hidden bg-[var(--surface)]">
                    <div
                      className="h-full rounded-full transition-all duration-300 bg-[var(--accent)]"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
