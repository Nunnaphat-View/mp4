import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

console.log('\x1b[36m%s\x1b[0m', '⚡ กำลังเริ่มระบบเซิร์ฟเวอร์สำหรับมือถือ...')

// 1. Start backend server.js on port 10000
const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: '10000' }
})

serverProcess.stdout.on('data', (d) => {
  const line = d.toString()
  if (line.includes('[yt-dlp')) {
    console.log('\x1b[33m%s\x1b[0m', line.trim())
  }
})

serverProcess.stderr.on('data', (d) => {
  const err = d.toString().trim()
  if (err && !err.includes('ExperimentalWarning')) {
    console.error(err)
  }
})

// 2. Start Cloudflare Tunnel
const cloudflaredPath = path.join(__dirname, 'cloudflared')
if (!fs.existsSync(cloudflaredPath)) {
  console.error('ไม่พบไฟล์ cloudflared ในโฟลเดอร์โปรเจกต์')
  process.exit(1)
}

const tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:10000'], {
  cwd: __dirname
})

let tunnelFound = false

tunnelProcess.stderr.on('data', (data) => {
  const text = data.toString()
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (match && !tunnelFound) {
    tunnelFound = true
    const publicUrl = match[0]
    console.log('\n\x1b[32m%s\x1b[0m', '==========================================================')
    console.log('\x1b[1m\x1b[32m%s\x1b[0m', '  🎉 เซิร์ฟเวอร์พร้อมใช้งานแล้ว!')
    console.log('\x1b[32m%s\x1b[0m', '==========================================================')
    console.log('\n\x1b[1m%s\x1b[0m', '  📱 เปิดลิงก์นี้ในเบราว์เซอร์บนมือถือได้ทันที:')
    console.log('\x1b[36m\x1b[4m%s\x1b[0m\n', `  👉 ${publicUrl}`)
    console.log('\x1b[90m%s\x1b[0m', '  (สามารถส่งลิงก์นี้เข้า LINE / AirDrop เพื่อเปิดบนมือถือได้เลย)')
    console.log('\x1b[90m%s\x1b[0m', '  กด Ctrl + C ใน Terminal เมื่อต้องการหยุดทำงาน\n')
  }
})

tunnelProcess.on('close', (code) => {
  serverProcess.kill()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\nกำลังปิดระบบ...')
  tunnelProcess.kill('SIGINT')
  serverProcess.kill('SIGINT')
  process.exit(0)
})
