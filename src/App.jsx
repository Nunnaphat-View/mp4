import React, { useState, useRef, useEffect } from 'react'
import { 
  Upload, 
  Video, 
  Music, 
  Download, 
  RefreshCw, 
  Play, 
  Pause, 
  Scissors, 
  FileVideo, 
  CheckCircle, 
  AlertCircle, 
  X,
  VolumeX,
  Volume2
} from 'lucide-react'

// Maximum duration constraint (30 seconds)
const MAX_TRIM_DURATION = 30

function App() {
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayingRange, setIsPlayingRange] = useState(false)
  const [format, setFormat] = useState('mp4')
  
  // FFmpeg related states
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  
  // Output states
  const [outputUrl, setOutputUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [customName, setCustomName] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  
  // Toast notifications
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
  const [dragActive, setDragActive] = useState(false)

  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const ffmpegRef = useRef(null)
  const timeUpdateHandlerRef = useRef(null)

  // Show Toast helper
  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3000)
  }

  // Format seconds to mm:ss.d
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '00:00.0'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`
  }

  // Format file size
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Handle file loading
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    processFile(selectedFile)
  }

  const processFile = (selectedFile) => {
    if (!selectedFile) return
    if (!selectedFile.type.startsWith('video/') && !selectedFile.name.endsWith('.mkv') && !selectedFile.name.endsWith('.mov')) {
      showToast('กรุณาเลือกไฟล์วีดีโอเท่านั้น', 'error')
      return
    }
    
    // Clean up previous URLs
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl)
      setOutputUrl('')
    }
    
    setFile(selectedFile)
    setStartTime(0)
    setIsPlaying(false)
    setIsPlayingRange(false)
    
    const objectUrl = URL.createObjectURL(selectedFile)
    
    // Temporary video element to extract duration
    const tempVideo = document.createElement('video')
    tempVideo.src = objectUrl
    tempVideo.onloadedmetadata = () => {
      const dur = tempVideo.duration
      setDuration(dur)
      setEndTime(Math.min(dur, MAX_TRIM_DURATION))
      showToast('โหลดวีดีโอสำเร็จ', 'success')
    }
    tempVideo.onerror = () => {
      showToast('ไม่สามารถอ่านข้อมูลวีดีโอได้ กรุณาลองไฟล์อื่น', 'error')
    }
  }

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  // Handle trim slider changes (ensuring max 30s limit)
  const handleStartChange = (e) => {
    const val = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = val
    }
    
    if (endTime - val > MAX_TRIM_DURATION) {
      setStartTime(val)
      setEndTime(val + MAX_TRIM_DURATION)
    } else if (val >= endTime - 0.1) {
      setStartTime(val)
      setEndTime(Math.min(duration, val + 0.1))
    } else {
      setStartTime(val)
    }
  }

  const handleEndChange = (e) => {
    const val = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = val
    }
    
    if (val - startTime > MAX_TRIM_DURATION) {
      setEndTime(val)
      setStartTime(Math.max(0, val - MAX_TRIM_DURATION))
    } else if (val <= startTime + 0.1) {
      setEndTime(val)
      setStartTime(Math.max(0, val - 0.1))
    } else {
      setEndTime(val)
    }
  }

  // Play/Pause Video
  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
      setIsPlayingRange(false)
    } else {
      // Clear range play triggers
      if (timeUpdateHandlerRef.current) {
        videoRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current)
        timeUpdateHandlerRef.current = null
      }
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  // Play specifically the trimmed range
  const playTrimmedRange = () => {
    if (!videoRef.current) return
    setIsPlayingRange(true)
    setIsPlaying(true)
    
    // Set video position to start of range
    videoRef.current.currentTime = startTime
    videoRef.current.play()
    
    // Remove previous listener if exists
    if (timeUpdateHandlerRef.current) {
      videoRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current)
    }
    
    // Define the range enforcement function
    const onTimeUpdate = () => {
      if (videoRef.current && videoRef.current.currentTime >= endTime) {
        videoRef.current.pause()
        setIsPlaying(false)
        setIsPlayingRange(false)
        videoRef.current.removeEventListener('timeupdate', onTimeUpdate)
        timeUpdateHandlerRef.current = null
      }
    }
    
    timeUpdateHandlerRef.current = onTimeUpdate
    videoRef.current.addEventListener('timeupdate', onTimeUpdate)
  }

  // Reset range selections
  const resetTrim = () => {
    setStartTime(0)
    setEndTime(Math.min(duration, MAX_TRIM_DURATION))
    if (videoRef.current) {
      videoRef.current.currentTime = 0
    }
    showToast('รีเซ็ตการเลือกช่วงเวลาแล้ว')
  }

  // Dynamic FFmpeg load
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current
    
    setStatusMessage('กำลังเตรียมระบบแปลงไฟล์...')
    
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    
    const ffmpeg = new FFmpeg()
    
    // Connect progress hook
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100))
    })
    
    // Connect log hook for debugging
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg log:', message)
    })

    let loaded = false
    const loadErrors = []

    // Try same-origin local files first
    try {
      setStatusMessage('กำลังเชื่อมต่อระบบแปลงไฟล์ในเครื่อง (Local)...')
      const origin = window.location.origin
      if (origin && origin !== 'null') {
        const localCore = `${origin}/ffmpeg-core.js`
        const localWasm = `${origin}/ffmpeg-core.wasm`
        
        await ffmpeg.load({
          coreURL: await toBlobURL(localCore, 'text/javascript'),
          wasmURL: await toBlobURL(localWasm, 'application/wasm'),
        })
        loaded = true
        console.log('FFmpeg loaded successfully from local assets.')
      }
    } catch (localErr) {
      console.warn('Failed to load FFmpeg from local assets. Falling back to CDN...', localErr)
      loadErrors.push(localErr)
    }

    // Try CDN fallback if local load failed
    if (!loaded) {
      try {
        setStatusMessage('กำลังดาวน์โหลดระบบแปลงไฟล์จากคลาวด์ (CDN)...')
        const cdnBase = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        loaded = true
        console.log('FFmpeg loaded successfully from CDN fallback.')
      } catch (cdnErr) {
        console.error('Failed to load FFmpeg from CDN:', cdnErr)
        loadErrors.push(cdnErr)
      }
    }

    if (!loaded) {
      throw new Error('ไม่สามารถเริ่มต้นโมดูลตัดคลิปได้ กรุณาลองเปิดใช้งานหน้าเว็บนี้ผ่านเซิร์ฟเวอร์ท้องถิ่น หรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')
    }
    
    ffmpegRef.current = ffmpeg
    return ffmpeg
  }

  // Conversion process
  const startConversion = async () => {
    if (!file) return
    setLoading(true)
    setProgress(0)
    setStatusMessage('กำลังโหลดโมดูลการประมวลผล...')
    
    try {
      const { fetchFile } = await import('@ffmpeg/util')
      const ffmpeg = await loadFFmpeg()
      
      setStatusMessage('กำลังวิเคราะห์และเตรียมไฟล์วีดีโอ...')
      const inputFilename = 'input_' + Date.now() + '_' + file.name
      const outputFilename = `trimmed_${Date.now()}.${format}`
      
      // Write file into FFmpeg's memory filesystem
      await ffmpeg.writeFile(inputFilename, await fetchFile(file))
      
      setStatusMessage('กำลังตัดคลิปและแปลงไฟล์ในเครื่องของคุณ...')
      
      const durationToTrim = endTime - startTime
      
      if (format === 'm4a') {
        // Extract audio and transcode it to AAC
        // -ss before -i for fast seeking, then limit using -t
        await ffmpeg.exec([
          '-ss', startTime.toFixed(3),
          '-i', inputFilename,
          '-t', durationToTrim.toFixed(3),
          '-vn', // no video
          '-c:a', 'aac',
          '-b:a', '192k', // solid audio quality
          outputFilename
        ])
      } else {
        // MP4 format requested. 
        // We attempt a fast stream copy (-c copy) first.
        // Stream copying does not re-encode, making it 50x faster.
        // However, if the source has codecs incompatible with MP4 or if we want exact precision on keyframes,
        // it might fail. Let's do copy for MP4 and MOV files, transcode for webm/mkv.
        const fileExt = file.name.split('.').pop().toLowerCase()
        const isStandardContainer = ['mp4', 'mov', 'm4v'].includes(fileExt)
        
        if (isStandardContainer) {
          setStatusMessage('กำลังตัดคลิปด่วน (Fast Stream Copy)...')
          try {
            await ffmpeg.exec([
              '-ss', startTime.toFixed(3),
              '-i', inputFilename,
              '-t', durationToTrim.toFixed(3),
              '-c', 'copy',
              outputFilename
            ])
          } catch (copyErr) {
            console.warn('Stream copy failed. Falling back to transcoding...', copyErr)
            setStatusMessage('การตัดด่วนล้มเหลว กำลังแปลงเข้ารหัสใหม่ (Transcoding)...')
            // Fallback: transcode video
            await ffmpeg.exec([
              '-ss', startTime.toFixed(3),
              '-i', inputFilename,
              '-t', durationToTrim.toFixed(3),
              '-c:v', 'libx264',
              '-c:a', 'aac',
              '-preset', 'ultrafast',
              outputFilename
            ])
          }
        } else {
          // WebM / MKV -> Transcode is required to build a valid MP4
          setStatusMessage('กำลังแปลงเข้ารหัสไฟล์ใหม่ (Transcoding)...')
          await ffmpeg.exec([
            '-ss', startTime.toFixed(3),
            '-i', inputFilename,
            '-t', durationToTrim.toFixed(3),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'ultrafast',
            outputFilename
          ])
        }
      }
      
      setStatusMessage('กำลังดึงข้อมูลไฟล์สำเร็จ...')
      
      // Read output file from memory FS
      const data = await ffmpeg.readFile(outputFilename)
      const mime = format === 'mp4' ? 'video/mp4' : 'audio/mp4'
      const blob = new Blob([data.buffer], { type: mime })
      const downloadUrl = URL.createObjectURL(blob)
      
      setOutputUrl(downloadUrl)
      const baseName = `trimmed-${file.name.substring(0, file.name.lastIndexOf('.')) || file.name}`
      setOutputName(`${baseName}.${format}`)
      setCustomName(baseName)
      setProgress(100)
      setStatusMessage('เสร็จสมบูรณ์!')
      showToast('แปลงไฟล์และตัดเสียงสำเร็จ!', 'success')
      
      // Cleanup files inside FFmpeg virtual filesystem to save memory
      await ffmpeg.deleteFile(inputFilename)
      await ffmpeg.deleteFile(outputFilename)
      
    } catch (err) {
      console.error(err)
      setStatusMessage('เกิดข้อผิดพลาดในการประมวลผล')
      showToast('การตัดหรือแปลงไฟล์ล้มเหลว: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Start over
  const resetAll = () => {
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl)
    }
    setFile(null)
    setDuration(0)
    setStartTime(0)
    setEndTime(0)
    setOutputUrl('')
    setOutputName('')
    setCustomName('')
    setProgress(0)
    setStatusMessage('')
    setIsPlaying(false)
    setIsPlayingRange(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle playback changes
  useEffect(() => {
    const handleVideoPause = () => {
      setIsPlaying(false)
    }
    const handleVideoPlay = () => {
      setIsPlaying(true)
    }
    
    const v = videoRef.current
    if (v) {
      v.addEventListener('pause', handleVideoPause)
      v.addEventListener('play', handleVideoPlay)
    }
    
    return () => {
      if (v) {
        v.removeEventListener('pause', handleVideoPause)
        v.removeEventListener('play', handleVideoPlay)
      }
    }
  }, [file])

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl)
      }
    }
  }, [outputUrl])

  // Custom slider background offsets
  const leftPercent = duration ? (startTime / duration) * 100 : 0
  const widthPercent = duration ? ((endTime - startTime) / duration) * 100 : 0
  const selectionLength = endTime - startTime

  return (
    <div className="app-container">
      {/* Toast Alert */}
      <div className={`toast-msg ${toast.show ? 'show' : ''}`}>
        {toast.type === 'success' && <CheckCircle size={16} style={{ color: '#10b981' }} />}
        {toast.type === 'error' && <AlertCircle size={16} style={{ color: '#ef4444' }} />}
        <span>{toast.message}</span>
      </div>

      <header className="app-header">
        <div className="logo-badge">
          <span className="logo-dot"></span>
          <span>100% Client Offline Converter</span>
        </div>
        <h1 className="app-title">ตัดคลิป & แปลงไฟล์</h1>
        <p className="app-subtitle">
          อัปโหลดวีดีโอ ตัดเลือกช่วงไม่เกิน 30 วินาที และแปลงเป็นไฟล์ MP4 หรือ M4A ได้ทันทีในบราวเซอร์คุณ (ไม่มีการอัปโหลดไฟล์ไปที่เซิร์ฟเวอร์)
        </p>
      </header>

      {/* STEP 1: Upload Video */}
      {!file && (
        <div 
          className={`glass-card active-card ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <div className="card-step step-active">
            <div className="step-num">1</div>
            <div className="step-title">อัปโหลดวีดีโอของคุณ</div>
          </div>
          
          <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*" 
              hidden 
            />
            <div className="dropzone-icon">
              <Upload size={24} />
            </div>
            <p className="dropzone-text">ลากไฟล์มาวางตรงนี้ หรือ แตะเพื่อเลือกไฟล์</p>
            <p className="dropzone-hint">รองรับไฟล์ MP4, MOV, WEBM, MKV และอื่นๆ</p>
          </div>
        </div>
      )}

      {/* STEP 2: Video Preview & Trim Controls */}
      {file && (
        <>
          <div className="glass-card active-card">
            <div className="card-step step-active">
              <div className="step-num">2</div>
              <div className="step-title">เลือกช่วงเวลา (จำกัดไม่เกิน 30 วินาที)</div>
              <button className="remove-btn" onClick={resetAll} style={{ marginLeft: 'auto' }}>
                <X size={18} />
              </button>
            </div>

            {/* Video File Detail Badge */}
            <div className="file-badge" style={{ marginBottom: '16px' }}>
              <FileVideo size={20} className="file-badge-icon" />
              <div className="file-meta">
                <div className="file-name">{file.name}</div>
                <div className="file-size">ขนาด {formatSize(file.size)} · ความยาวทั้งหมด {formatTime(duration)}</div>
              </div>
            </div>

            {/* Video Player */}
            <div className="player-container">
              <video 
                ref={videoRef}
                src={URL.createObjectURL(file)} 
                className="preview-video" 
                controls={false}
                playsInline
                muted={isMuted}
              />
              
              {/* Custom Play Control Overlay */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                display: 'flex',
                gap: '8px',
                zIndex: 10
              }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setIsMuted(!isMuted)}
                  style={{ borderRadius: '50%', width: '38px', height: '38px', padding: 0 }}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={togglePlay}
                  style={{ borderRadius: '50%', width: '38px', height: '38px', padding: 0 }}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>
            </div>

            {/* Range Trim Slider */}
            <div className="trim-slider-wrapper">
              <div className="trim-labels">
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>เลือกช่วงเวลาที่จะตัด</span>
                <span className="trim-duration-badge">
                  {selectionLength.toFixed(1)} วินาที
                </span>
              </div>

              <div className="double-slider-container">
                <div className="slider-track"></div>
                <div 
                  className="slider-highlight" 
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                ></div>
                
                <input 
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.05}
                  value={startTime}
                  onChange={handleStartChange}
                  className="range-input"
                />
                
                <input 
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.05}
                  value={endTime}
                  onChange={handleEndChange}
                  className="range-input"
                />
              </div>

              <div className="time-readout">
                <div>
                  เริ่ม: <span className="time-start">{formatTime(startTime)}</span>
                </div>
                <div>
                  สิ้นสุด: <span className="time-end">{formatTime(endTime)}</span>
                </div>
              </div>
            </div>

            {/* Trim controls buttons */}
            <div className="trim-actions">
              <button className="btn-secondary" onClick={playTrimmedRange}>
                <Play size={14} /> เล่นช่วงที่เลือก
              </button>
              <button className="btn-secondary" onClick={resetTrim}>
                <RefreshCw size={14} /> รีเซ็ตช่วงเวลา
              </button>
            </div>
          </div>

          {/* STEP 3: Format Selection */}
          <div className="glass-card">
            <div className="card-step step-active">
              <div className="step-num">3</div>
              <div className="step-title">เลือกรูปแบบไฟล์เป้าหมาย</div>
            </div>

            <div className="format-grid">
              <div 
                className={`format-option ${format === 'mp4' ? 'selected' : ''}`}
                onClick={() => setFormat('mp4')}
              >
                <div className="format-icon">🎬</div>
                <p className="format-title">MP4</p>
                <p className="format-desc">วีดีโอและเสียงร่วมกัน</p>
              </div>

              <div 
                className={`format-option ${format === 'm4a' ? 'selected' : ''}`}
                onClick={() => setFormat('m4a')}
              >
                <div className="format-icon">🎵</div>
                <p className="format-title">M4A</p>
                <p className="format-desc">เฉพาะไฟล์เสียง (แยกเสียง)</p>
              </div>
            </div>
          </div>

          {/* STEP 4: Convert Execution & Progress */}
          <div className="glass-card">
            <div className="card-step step-active">
              <div className="step-num">4</div>
              <div className="step-title">ประมวลผลไฟล์</div>
            </div>

            {!outputUrl && !loading && (
              <button className="btn-primary" onClick={startConversion} disabled={loading}>
                <Scissors size={18} /> ตัดคลิปและแปลงไฟล์
              </button>
            )}

            {/* Loading & progress block */}
            {loading && (
              <div className="progress-container">
                <div className="progress-header">
                  <span>{statusMessage}</span>
                  <span className="progress-pct">{progress}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            {/* Output Display & Download block */}
            {outputUrl && !loading && (
              <div className="result-box">
                <div className="success-alert">
                  <CheckCircle size={18} />
                  <span>ตัดคลิปและแปลงเสร็จเรียบร้อย!</span>
                </div>

                <div className="output-player-wrapper">
                  {format === 'mp4' ? (
                    <video src={outputUrl} controls className="output-video" playsInline />
                  ) : (
                    <audio src={outputUrl} controls className="output-audio" />
                  )}
                </div>

                {/* Custom File Name Input */}
                <div style={{ margin: '8px 0 4px', width: '100%', boxSizing: 'border-box' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '12.5px', 
                    fontWeight: '600', 
                    marginBottom: '6px', 
                    color: 'var(--text-main)', 
                    textAlign: 'left' 
                  }}>
                    ชื่อไฟล์ตอนบันทึก:
                  </label>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
                    <input 
                      type="text" 
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      style={{
                        flexGrow: 1,
                        background: '#ffffff',
                        border: '1.5px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        fontSize: '14px',
                        fontWeight: '500',
                        fontFamily: 'inherit',
                        color: 'var(--text-dark)',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        boxSizing: 'border-box',
                        minWidth: 0
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                      placeholder="ระบุชื่อไฟล์..."
                    />
                    <span style={{ 
                      fontSize: '13.5px', 
                      fontWeight: '700', 
                      color: 'var(--text-muted)',
                      background: '#ede8df',
                      border: '1.5px solid var(--border-color)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      userSelect: 'none'
                    }}>
                      .{format}
                    </span>
                  </div>
                </div>

                <a 
                  href={outputUrl} 
                  download={customName ? `${customName.trim()}.${format}` : outputName} 
                  className="btn-download"
                >
                  <Download size={18} /> ดาวน์โหลดไฟล์ ({format.toUpperCase()})
                </a>

                <button className="btn-reset" onClick={resetAll}>
                  <RefreshCw size={14} /> ทำไฟล์อื่นต่อ
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <footer className="app-footer">
        ประมวลผลอย่างปลอดภัยในเบราว์เซอร์ของคุณ · ไฟล์จะไม่ถูกบันทึกหรือส่งออกภายนอกอุปกรณ์
      </footer>
    </div>
  )
}

export default App
