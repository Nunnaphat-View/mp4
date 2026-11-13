
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 10000
const DIST_DIR = path.join(__dirname, 'dist')

// Resolve yt-dlp binary path
function resolveYtDlp() {
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp'
  const localBinary = path.join(__dirname, 'yt-dlp')
  if (fs.existsSync(localBinary)) return localBinary
  return 'yt-dlp'
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4'
}

const server = http.createServer((req, res) => {
  // CORS Headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname

  // Health check endpoint
  if (pathname === '/health' || pathname === '/api/health') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'ok', service: 'mp4-converter', time: new Date().toISOString() }))
    return
  }

  // YouTube Audio Extraction API
  if (pathname === '/api/yt-convert') {
    const videoId = parsedUrl.searchParams.get('videoId')
    const filename = parsedUrl.searchParams.get('name') || 'audio'

    if (!videoId) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'videoId is required' }))
      return
    }

    console.log(`[YouTube Engine] Request audio stream for: ${videoId}`)
    const ytDlpPath = resolveYtDlp()

    const args = [
      '-f', 'ba/b',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '-o', '-',
      `https://www.youtube.com/watch?v=${videoId}`
    ]

    const ytProcess = spawn(ytDlpPath, args)

    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/webm')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}.audio"`
    )

    ytProcess.stdout.pipe(res)

    let stderr = ''
    ytProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const line = chunk.toString().trim()
      if (line.includes('[download]') || line.includes('[info]')) {
        console.log(`[yt-dlp ${videoId}] ${line.slice(0, 80)}`)
      }
    })

    ytProcess.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        console.error(`[yt-dlp] Process exited with code ${code}:`, stderr)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: stderr || `yt-dlp exited with code ${code}` }))
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

  // Serve static files from dist
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname)

  // Security check: ensure path stays within dist
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(DIST_DIR, 'index.html')
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 500
        res.end('Error loading file')
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', contentType)
      res.end(content)
    })
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
