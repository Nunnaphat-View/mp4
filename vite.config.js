import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// Local YouTube audio extraction middleware
function youtubeDevProxy() {
  return {
    name: 'youtube-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yt-convert', async (req, res) => {
        try {
          const urlObj = new URL(req.url, 'http://localhost')
          const videoId = urlObj.searchParams.get('videoId')
          const filename = urlObj.searchParams.get('name') || 'audio'

          if (!videoId) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'videoId is required' }))
            return
          }

          console.log(`[YouTube Engine] Streaming audio for: ${videoId}`)

          // Path to local yt-dlp binary
          const ytDlpPath = path.resolve(process.cwd(), 'yt-dlp')

          if (fs.existsSync(ytDlpPath)) {
            // Use local yt-dlp binary with stdout piping
            const ytProcess = spawn(ytDlpPath, [
              '-f', 'ba/b',
              '--no-playlist',
              '--extractor-args', 'youtube:player_client=ios,android,web',
              '-o', '-',
              `https://www.youtube.com/watch?v=${videoId}`
            ])

            res.setHeader('Content-Type', 'audio/webm')
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${encodeURIComponent(filename)}.audio"`
            )
            res.setHeader('Access-Control-Allow-Origin', '*')

            ytProcess.stdout.pipe(res)

            let stderrData = ''
            ytProcess.stderr.on('data', (data) => {
              const msg = data.toString()
              stderrData += msg
              if (msg.includes('[download]') || msg.includes('[info]')) {
                // Useful progress info
                process.stdout.write(`\r[yt-dlp ${videoId}] ${msg.trim().slice(0, 80)}`)
              }
            })

            ytProcess.on('close', (code) => {
              if (code !== 0 && !res.headersSent) {
                console.error(`[yt-dlp] Process exited with code ${code}:`, stderrData)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: stderrData || `yt-dlp failed with exit code ${code}` }))
              }
            })

            ytProcess.on('error', (err) => {
              console.error('[yt-dlp] Spawn error:', err)
              if (!res.headersSent) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message }))
              }
            })

            req.on('close', () => {
              if (!ytProcess.killed) {
                ytProcess.kill('SIGTERM')
              }
            })

            return
          }

          // Fallback if yt-dlp binary not found
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'yt-dlp binary not found' }))
        } catch (err) {
          console.error('[YouTube Engine] Server error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile(), youtubeDevProxy()],
  worker: {
    format: 'iife',
  }
})
