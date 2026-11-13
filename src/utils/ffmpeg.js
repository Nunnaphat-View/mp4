/**
 * Shared FFmpeg WebAssembly Singleton Loader & Audio Transcoder
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpegInstance = null
let ffmpegLoadingPromise = null

/**
 * Detects audio format from file magic bytes
 * @param {Uint8Array} uint8 
 * @returns {string}
 */
export function detectAudioExtension(uint8) {
  if (!uint8 || uint8.length < 8) return 'webm'
  // WebM / EBML header: 0x1A 0x45 0xDF 0xA3
  if (uint8[0] === 0x1A && uint8[1] === 0x45 && uint8[2] === 0xDF && uint8[3] === 0xA3) {
    return 'webm'
  }
  // MP4 / M4A: 'ftyp' at offset 4
  if (uint8[4] === 0x66 && uint8[5] === 0x74 && uint8[6] === 0x79 && uint8[7] === 0x70) {
    return 'm4a'
  }
  // Ogg: 'OggS'
  if (uint8[0] === 0x4F && uint8[1] === 0x67 && uint8[2] === 0x67 && uint8[3] === 0x53) {
    return 'ogg'
  }
  // MP3: 'ID3' or frame sync (0xFF 0xFB)
  if ((uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) ||
      (uint8[0] === 0xFF && (uint8[1] & 0xE0) === 0xE0)) {
    return 'mp3'
  }
  return 'webm'
}

/**
 * Loads and initializes the FFmpeg WebAssembly instance
 * @param {function} onStatus 
 * @param {function} onProgress 
 * @returns {Promise<FFmpeg>}
 */
export async function getFFmpeg(onStatus = () => {}, onProgress = () => {}) {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance
  }

  if (ffmpegLoadingPromise) {
    return ffmpegLoadingPromise
  }

  ffmpegLoadingPromise = (async () => {
    onStatus('กำลังเตรียมระบบแปลงไฟล์เสียง...')

    const ffmpeg = new FFmpeg()

    ffmpeg.on('progress', ({ progress }) => {
      onProgress(Math.round(progress * 100))
    })

    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message)
    })

    let loaded = false
    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    // 1. Try local same-origin assets first
    if (origin && origin !== 'null') {
      try {
        onStatus('กำลังเชื่อมต่อระบบแปลงไฟล์ในเครื่อง (Local)...')
        const localCore = `${origin}/ffmpeg-core.js`
        const localWasm = `${origin}/ffmpeg-core.wasm`

        await ffmpeg.load({
          coreURL: await toBlobURL(localCore, 'text/javascript'),
          wasmURL: await toBlobURL(localWasm, 'application/wasm'),
        })
        loaded = true
      } catch (localErr) {
        console.warn('Local FFmpeg load failed, trying CDN fallback...', localErr)
      }
    }

    // 2. Try unpkg CDN fallback
    if (!loaded) {
      try {
        onStatus('กำลังดาวน์โหลดระบบแปลงไฟล์จากคลาวด์ (CDN)...')
        const cdnBase = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'

        await ffmpeg.load({
          coreURL: await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        loaded = true
      } catch (cdnErr) {
        console.error('CDN FFmpeg load failed:', cdnErr)
      }
    }

    if (!loaded) {
      ffmpegLoadingPromise = null
      throw new Error('ไม่สามารถเริ่มต้นโมดูลแปลงไฟล์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')
    }

    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return ffmpegLoadingPromise
}

/**
 * Transcodes raw audio buffer into genuine MP3 using FFmpeg WebAssembly
 * @param {ArrayBuffer|Uint8Array} rawAudioBuffer 
 * @param {string} bitrate ('320', '256', '192', '128')
 * @param {function} onStatus 
 * @param {function} onProgress 
 * @returns {Promise<Blob>}
 */
export async function transcodeToMp3(rawAudioBuffer, bitrate = '320', onStatus = () => {}, onProgress = () => {}) {
  const uint8 = rawAudioBuffer instanceof Uint8Array ? rawAudioBuffer : new Uint8Array(rawAudioBuffer)
  const ext = detectAudioExtension(uint8)

  // If already MP3, return immediately without re-encoding
  if (ext === 'mp3') {
    onStatus('ไฟล์เสียงอยู่ในรูปแบบ MP3 อยู่แล้ว กำลังบันทึกไฟล์...')
    return new Blob([uint8.buffer], { type: 'audio/mpeg' })
  }

  const ffmpeg = await getFFmpeg(onStatus, onProgress)

  onStatus(`กำลังเข้ารหัสเป็นไฟล์ MP3 ${bitrate} kbps ในเครื่องคุณ...`)

  const timestamp = Date.now()
  const inputName = `input_${timestamp}.${ext}`
  const outputName = `output_${timestamp}.mp3`

  try {
    await ffmpeg.writeFile(inputName, uint8)

    // Run libmp3lame encoder in WebAssembly
    await ffmpeg.exec([
      '-y',
      '-i', inputName,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', `${bitrate}k`,
      '-ar', '44100',
      outputName
    ])

    onStatus('สร้างไฟล์ MP3 สำเร็จ!')
    const data = await ffmpeg.readFile(outputName)
    const mp3Blob = new Blob([data.buffer], { type: 'audio/mpeg' })

    // Clean up memory
    try {
      await ffmpeg.deleteFile(inputName)
      await ffmpeg.deleteFile(outputName)
    } catch {
      // Ignored
    }

    return mp3Blob
  } catch (err) {
    try {
      await ffmpeg.deleteFile(inputName)
      await ffmpeg.deleteFile(outputName)
    } catch {
      // Ignored
    }
    throw new Error('การเข้ารหัส MP3 ล้มเหลว: ' + err.message)
  }
}
