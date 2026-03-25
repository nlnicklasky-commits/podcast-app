import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'child_process'

/**
 * Vite plugin that adds a local /api/process/:podcastId endpoint.
 * Runs the yt-dlp download script as a child process so the frontend
 * Process button works without any CLI commands.
 */
function localProcessingApi() {
  return {
    name: 'local-processing-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/api\/process\/([a-f0-9-]+)$/)
        if (!match || req.method !== 'POST') return next()

        const podcastId = match[1]
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        // Spawn the download script as a detached child process
        // so the response returns immediately while processing continues
        const child = spawn('node', ['scripts/download-audio.js', podcastId], {
          cwd: process.cwd(),
          stdio: 'ignore',
          detached: true,
        })

        child.unref()

        res.writeHead(200)
        res.end(JSON.stringify({ started: true, podcast_id: podcastId }))
      })

      // Handle CORS preflight for the API endpoint
      server.middlewares.use((req, res, next) => {
        if (req.method === 'OPTIONS' && req.url?.startsWith('/api/process/')) {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.writeHead(204)
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localProcessingApi()],
})
