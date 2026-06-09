import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { getProgress, saveProgress } from '../services/playback'

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2]
const SAVE_DEBOUNCE_MS = 10_000
const COMPLETION_THRESHOLD = 0.9

const AudioContext = createContext(null)

export function AudioProvider({ children }) {
  const { user } = useAuth()
  const audioRef = useRef(null)
  const lastSaveRef = useRef(0)
  const saveTimerRef = useRef(null)
  const completionSavedRef = useRef(false)

  const [track, setTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

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
    [user, track?.podcastId],
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
      setTrack({ podcastId, title, channel, thumbnailUrl, enclosureUrl })
      setCurrentTime(0)
      setDuration(0)

      audio.src = enclosureUrl
      audio.load()

      const applyStart = async () => {
        let resumeTime = startTime ?? null

        if (resumeTime == null && user) {
          const saved = await getProgress(podcastId)
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
    audio.currentTime = time
    setCurrentTime(time)
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

  return (
    <AudioContext.Provider
      value={{
        track,
        isPlaying,
        currentTime,
        duration,
        speed,
        audioRef,
        play,
        pause,
        togglePlay,
        seek,
        cycleSpeed,
        stop,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        style={{ display: 'none' }}
      />
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const ctx = useContext(AudioContext)
  if (!ctx) throw new Error('useAudio must be used within AudioProvider')
  return ctx
}
