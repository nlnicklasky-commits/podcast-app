#!/usr/bin/env node

/**
 * Download YouTube audio via yt-dlp and upload to Supabase Storage.
 * Then triggers the edge function to process (transcribe → chunk → embed → insights).
 *
 * Usage:
 *   node scripts/download-audio.js <podcast_id>
 *
 * Requirements:
 *   - yt-dlp installed (pip install yt-dlp)
 *   - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 *
 * What it does:
 *   1. Fetches podcast record from Supabase (gets YouTube URL)
 *   2. Downloads audio with yt-dlp (smallest audio, <25MB for Whisper)
 *   3. Uploads to Supabase Storage (podcast-audio bucket)
 *   4. Updates podcast status + triggers edge function for transcription/processing
 */

import { createClient } from '@supabase/supabase-js'
import { execSync, spawn } from 'child_process'
import { readFileSync, unlinkSync, statSync, existsSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env from project root
config({ path: resolve(import.meta.dirname, '..', '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const podcastId = process.argv[2]
if (!podcastId) {
  console.error('Usage: node scripts/download-audio.js <podcast_id>')
  process.exit(1)
}

async function log(step, message) {
  console.log(`[${step}] ${message}`)
  await supabase.from('processing_logs').insert({
    podcast_id: podcastId,
    step,
    message,
  })
}

async function setStatus(status, progress = null) {
  const update = { status, updated_at: new Date().toISOString() }
  if (progress !== null) update.progress = progress
  await supabase.from('podcasts').update(update).eq('id', podcastId)
}

async function setProgress(progress) {
  await supabase.from('podcasts').update({ progress: Math.round(progress) }).eq('id', podcastId)
}

async function main() {
  // 1. Fetch podcast record
  const { data: pods, error } = await supabase
    .from('podcasts')
    .select('id, url, title, youtube_video_id')
    .eq('id', podcastId)
    .limit(1)

  if (error || !pods?.[0]) {
    console.error('Podcast not found:', error?.message || podcastId)
    process.exit(1)
  }

  const podcast = pods[0]
  console.log(`\nProcessing: ${podcast.title || podcast.url}\n`)

  // 2. Download audio with yt-dlp
  await setStatus('downloading', 0)
  await log('downloading', 'Starting audio download with yt-dlp...')

  const tmpFile = resolve(import.meta.dirname, `${podcast.youtube_video_id}.audio`)

  try {
    // Find yt-dlp
    let ytdlp = 'yt-dlp'
    try {
      execSync('yt-dlp --version', { stdio: 'pipe' })
    } catch {
      // Try common locations
      const locations = [
        resolve(process.env.HOME || '', '.local/bin/yt-dlp'),
        '/usr/local/bin/yt-dlp',
      ]
      ytdlp = locations.find(p => existsSync(p)) || 'python3 -m yt_dlp'
    }

    // Download smallest audio format (we need <25MB for Whisper)
    // Step 1: Download the file
    const downloadCmd = `${ytdlp} -f "ba[filesize<25M]/ba" --no-playlist -o "${tmpFile}.%(ext)s" "${podcast.url}"`

    await log('downloading', `Running: yt-dlp for ${podcast.youtube_video_id}`)

    execSync(downloadCmd, {
      encoding: 'utf-8',
      timeout: 180000, // 3 min timeout
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Step 2: Find the downloaded file (yt-dlp adds the extension)
    const dir = resolve(import.meta.dirname)
    const prefix = `${podcast.youtube_video_id}.audio.`
    const { readdirSync } = await import('fs')
    const files = readdirSync(dir).filter(f => f.startsWith(prefix))
    if (files.length === 0) {
      throw new Error('yt-dlp finished but no audio file found')
    }
    const downloadedFile = resolve(dir, files[0])

    if (!existsSync(downloadedFile)) {
      throw new Error(`Downloaded file not found: ${downloadedFile}`)
    }

    const fileSize = statSync(downloadedFile).size
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1)
    await setProgress(15)
    await log('downloading', `Downloaded ${sizeMB}MB audio file.`)

    if (fileSize > 25 * 1024 * 1024) {
      throw new Error(`Audio file is ${sizeMB}MB, exceeds Whisper's 25MB limit. Try a shorter podcast.`)
    }

    // 3. Upload to Supabase Storage
    await setProgress(20)
    await log('downloading', 'Uploading audio to Supabase Storage...')

    const ext = downloadedFile.split('.').pop()
    const storagePath = `${podcastId}.${ext}`
    const fileBuffer = readFileSync(downloadedFile)

    const { error: uploadError } = await supabase.storage
      .from('podcast-audio')
      .upload(storagePath, fileBuffer, {
        contentType: ext === 'webm' ? 'audio/webm' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`,
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    await setProgress(28)
    await log('downloading', `Uploaded to Storage: ${storagePath} (${sizeMB}MB)`)

    // Clean up local file
    try { unlinkSync(downloadedFile) } catch { /* ignore permission errors on mounted fs */ }

    // 4. Update podcast with storage path and trigger edge function
    await setProgress(30)
    await log('downloading', 'Download complete. Triggering processing pipeline...')

    // Store the storage path so the edge function knows where to find it
    await supabase.from('podcasts').update({
      status: 'downloading', // edge function will pick up from here
      progress: 30,
    }).eq('id', podcastId)

    // Trigger edge function
    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token || SUPABASE_ANON_KEY

    const response = await fetch(`${SUPABASE_URL}/functions/v1/process-podcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        podcast_id: podcastId,
        audio_storage_path: storagePath,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Edge function failed: ${err.error || response.status}`)
    }

    const result2 = await response.json()
    console.log('\nDone!', result2)

  } catch (err) {
    console.error('\nError:', err.message)
    await setStatus('error')
    await supabase.from('podcasts').update({ error_message: err.message }).eq('id', podcastId)
    await log('error', err.message)

    // Clean up temp files (best effort)
    try {
      const { readdirSync } = await import('fs')
      const dir = resolve(import.meta.dirname)
      const prefix = `${podcastId}.`
      readdirSync(dir).filter(f => f.startsWith(prefix)).forEach(f => {
        try { unlinkSync(resolve(dir, f)) } catch {}
      })
    } catch {}

    process.exit(1)
  }
}

main()
