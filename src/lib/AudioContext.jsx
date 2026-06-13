import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from './useAuth'
import { useToast } from './ToastContext'
import { getProgress, saveProgress } from '../services/playback'

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2]
const SAVE_DEBOUNCE_MS = 10_000
const COMPLETION_THRESHOLD = 0.9

const AudioContext = createContext(null)
const AudioTimeContext = createContext(null)

export function AudioProvider({ children }) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const audioRef = useRef(null)
  const lastSaveRef = useRef(0)
  const saveTimerRef = useRef(null)
  const completionSavedRef = useRef(false)
  const pendingStartRef = useRef(null)
  const currentPodcastIdRef = useRef(null)

  const [track, setTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [error, setError] = useState(null)

  const persistProgress = useCallback(
    async (force = false) => {
      const audio = audioRef.current
      if (!audio || !user || !track?.podcastId) return
      const now = Date.now()
      if (!force && now - lastSaveRef.current < SAVE_DEBOUNCE_MS) return
      lastSaveRef.current = now

      const completed = audio.duration
        ? audio.currentTime / audio.duration >= COMPLETION_THRESHOLD
        : false

      await saveProgress(track.podcastId, {
        positionSeconds: audio.currentTime,
        durationSeconds: audio.duration || null,
        playbackSpeed: audio.playbackRate,
        completed,
      })
    },
    [user, track],
  )

  useEffect(() => {
    if (!isPlaying) return
    saveTimerRef.current = setInterval(() => persistProgress(true), SAVE_DEBOUNCE_MS)
    return () => clearInterval(saveTimerRef.current)
  }, [isPlaying, persistProgress])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') persistProgress(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [persistProgress])

  const play = useCallback(
    async ({ podcastId, title, channel, thumbnailUrl, enclosureUrl, startTime }) => {
      const audio = audioRef.current
      if (!audio) return

      if (track?.podcastId === podcastId && audio.src) {
        if (startTime != null) audio.currentTime = startTime
        audio.play()
        return
      }

      if (track?.podcastId) {
        await persistProgress(true)
      }

      completionSavedRef.current = false
      lastSaveRef.current = 0
      currentPodcastIdRef.current = podcastId
      setError(null)
      setTrack({ podcastId, title, channel, thumbnailUrl, enclosureUrl })
      setCurrentTime(0)
      setDuration(0)

      // Remove any queued loadedmetadata listener from a prior, superseded play()
      if (pendingStartRef.current) {
        audio.removeEventListener('loadedmetadata', pendingStartRef.current)
        pendingStartRef.current = null
      }

      audio.src = enclosureUrl
      audio.load()

      const applyStart = async () => {
        // Bail if a newer play() has superseded this one
        if (currentPodcastIdRef.current !== podcastId) return

        let resumeTime = startTime ?? null

        if (resumeTime == null && user) {
          const saved = await getProgress(podcastId)
          if (currentPodcastIdRef.current !== podcastId) return
          if (saved && saved.position_seconds > 0 && !saved.completed) {
            resumeTime = saved.position_seconds
            if (saved.playback_speed) {
              setSpeed(saved.playback_speed)
              audio.playbackRate = saved.playback_speed
            }
          }
        }

        if (resumeTime != null && resumeTime > 0) {
          audio.currentTime = resumeTime
        }

        audio.play()
      }

      if (audio.readyState >= 1) {
        applyStart()
      } else {
        pendingStartRef.current = applyStart
        audio.addEventListener('loadedmetadata', applyStart, { once: true })
      }
    },
    [track?.podcastId, user, persistProgress],
  )

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    if (audio.paused) {
      audio.play()
    } else {
      audio.pause()
    }
  }, [track])

  const seek = useCallback((time) => {
    const audio = audioRef.current
    if (!audio) return
    const clamped = Math.max(0, Math.min(time, audio.duration || 0))
    audio.currentTime = clamped
    setCurrentTime(clamped)
  }, [])

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const idx = PLAYBACK_SPEEDS.indexOf(speed)
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length]
    setSpeed(next)
    audio.playbackRate = next
  }, [speed])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      persistProgress(true)
      audio.pause()
      audio.src = ''
    }
    setTrack(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [persistProgress])

  function handlePlay() {
    setIsPlaying(true)
  }

  function handlePause() {
    setIsPlaying(false)
    persistProgress(true)
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    if (audio.duration && audio.currentTime / audio.duration >= COMPLETION_THRESHOLD) {
      if (!completionSavedRef.current) {
        completionSavedRef.current = true
        persistProgress(true)
      }
    }
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (audio) setDuration(audio.duration || 0)
  }

  function handleEnded() {
    setIsPlaying(false)
    persistProgress(true)
  }

  function handleError() {
    const audio = audioRef.current
    if (!audio?.src || audio.src === window.location.href) return
    const msg = 'Unable to play — audio URL may be unavailable'
    setError(msg)
    setIsPlaying(false)
    addToast(msg, 'error')
  }

  const value = useMemo(
    () => ({
      track,
      isPlaying,
      speed,
      error,
      audioRef,
      play,
      pause,
      togglePlay,
      seek,
      cycleSpeed,
      stop,
    }),
    [track, isPlaying, speed, error, play, pause, togglePlay, seek, cycleSpeed, stop],
  )

  const timeValue = useMemo(() => ({ currentTime, duration }), [currentTime, duration])

  return (
    <AudioContext.Provider value={value}>
      <AudioTimeContext.Provider value={timeValue}>
        {children}
        <audio
          ref={audioRef}
          preload="metadata"
          onPlay={handlePlay}
          onPause={handlePause}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onError={handleError}
          style={{ display: 'none' }}
        />
      </AudioTimeContext.Provider>
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const ctx = useContext(AudioContext)
  if (!ctx) throw new Error('useAudio must be used within AudioProvider')
  return ctx
}

export function useAudioTime() {
  const ctx = useContext(AudioTimeContext)
  if (!ctx) throw new Error('useAudioTime must be used within AudioProvider')
  return ctx
}
