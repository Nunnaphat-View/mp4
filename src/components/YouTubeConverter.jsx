import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Music,
  Download,
  Link,
  Clipboard,
  Check,
  RefreshCw,
  ArrowLeftRight,
  Disc,
  FileAudio,
  X,
  Sparkles,
  Settings
} from 'lucide-react'
import {
  extractVideoId,
  fetchYouTubeMetadata,
  convertToMp3,
  sanitizeFilename,
  getApiBaseUrl
} from '../utils/youtube'

export default function YouTubeConverter({ showToast }) {
  const [url, setUrl] = useState('')
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [videoData, setVideoData] = useState(null)
  const [showServerModal, setShowServerModal] = useState(false)
  const [backendUrlInput, setBackendUrlInput] = useState(() => getApiBaseUrl())

  // Editable song & artist metadata
  const [songTitle, setSongTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [namingFormat, setNamingFormat] = useState('artist_title')
  const [customFilename, setCustomFilename] = useState('')
  const [bitrate, setBitrate] = useState('320')

  // Conversion process states
  const [converting, setConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [conversionResult, setConversionResult] = useState(null)
  const [copiedName, setCopiedName] = useState(false)

  const inputRef = useRef(null)

  // Compute final filename based on current settings
  const getComputedFilename = useCallback(() => {
    if (namingFormat === 'custom' && customFilename.trim()) {
      return sanitizeFilename(customFilename.trim())
    }
    const cleanArtist = artist.trim() || 'Unknown Artist'
    const cleanTitle = songTitle.trim() || 'Untitled'

    if (namingFormat === 'title_artist') {
      return sanitizeFilename(`${cleanTitle} - ${cleanArtist}`)
    }
    if (namingFormat === 'title_only') {
      return sanitizeFilename(cleanTitle)
    }
    // Default: Artist - Title
    return sanitizeFilename(`${cleanArtist} - ${cleanTitle}`)
  }, [namingFormat, customFilename, artist, songTitle])

  // Update custom filename whenever song title or artist changes
  useEffect(() => {
    if (namingFormat !== 'custom') {
      setCustomFilename(getComputedFilename())
    }
  }, [artist, songTitle, namingFormat, getComputedFilename])

  // Handle URL Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setUrl(text)
          processUrl(text)
          showToast('วางลิงก์จากคลิปบอร์ดแล้ว', 'info')
          return
        }
      }
    } catch {
      // Clipboard permission denied or unsupported
    }
    inputRef.current?.focus()
  }

  // Process and extract YouTube video data
  const processUrl = async (inputUrl) => {
    const rawUrl = inputUrl || url
    const videoId = extractVideoId(rawUrl)

    if (!videoId) {
      showToast('กรุณาระบุลิงก์ YouTube หรือ YouTube Music ให้ถูกต้อง', 'error')
      return
    }

    setLoadingInfo(true)
    setStatusMessage('กำลังดึงข้อมูลเพลงจาก YouTube...')

    try {
      const data = await fetchYouTubeMetadata(videoId)
      setVideoData(data)
      setSongTitle(data.songTitle)
      setArtist(data.artist)

      // Set default filename: "Artist - Song"
      const defaultName = sanitizeFilename(`${data.artist} - ${data.songTitle}`)
      setCustomFilename(defaultName)
      setNamingFormat('artist_title')
      setConversionResult(null)

      showToast('ดึงข้อมูลเพลงและศิลปินสำเร็จ!', 'success')
    } catch (err) {
      console.error(err)
      showToast(err.message || 'ไม่สามารถดึงข้อมูลเพลงได้ กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      setLoadingInfo(false)
      setStatusMessage('')
    }
  }

  // Swap Song Title <-> Artist
  const handleSwapArtistTitle = () => {
    const prevArtist = artist
    const prevTitle = songTitle
    setArtist(prevTitle)
    setSongTitle(prevArtist)
    showToast('สลับชื่อศิลปินและชื่อเพลงแล้ว', 'info')
  }

  // Trigger Local MP3 conversion
  const handleStartConversion = async () => {
    if (!videoData) return

    const finalName = getComputedFilename()
    setConverting(true)
    setProgress(15)
    setStatusMessage('กำลังเชื่อมต่อดึงเสียงจาก YouTube โดยตรง...')
    setConversionResult(null)

    try {
      setProgress(35)
      const result = await convertToMp3(
        videoData.videoId,
        finalName,
        bitrate,
        (msg) => {
          setStatusMessage(msg)
          setProgress((prev) => Math.min(prev + 12, 90))
        }
      )

      setProgress(100)

      if (result.success) {
        setConversionResult(result)
        showToast('แปลงไฟล์เพลงสำเร็จ และเริ่มดาวน์โหลดลงเครื่องแล้ว!', 'success')

        // Auto trigger download into user's computer
        triggerBrowserDownload(result.blobUrl, `${finalName}.mp3`)
      }
    } catch (err) {
      console.error(err)
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error')
    } finally {
      setConverting(false)
    }
  }

  // Helper to trigger browser download
  const triggerBrowserDownload = (downloadUrl, fileName) => {
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.setAttribute('download', fileName)
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
    }, 1000)
  }

  // Copy filename to clipboard
  const handleCopyFilename = () => {
    const nameWithExt = `${getComputedFilename()}.mp3`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(nameWithExt)
      setCopiedName(true)
      showToast('คัดลอกชื่อไฟล์แล้ว: ' + nameWithExt, 'success')
      setTimeout(() => setCopiedName(false), 2500)
    }
  }

  // Reset to convert another track
  const handleReset = () => {
    if (conversionResult?.blobUrl) {
      URL.revokeObjectURL(conversionResult.blobUrl)
    }
    setUrl('')
    setVideoData(null)
    setSongTitle('')
    setArtist('')
    setCustomFilename('')
    setConversionResult(null)
    setProgress(0)
    setStatusMessage('')
  }

  const handleSaveBackendUrl = (val) => {
    const cleaned = (val || '').trim().replace(/\/$/, '')
    setBackendUrlInput(cleaned)
    if (cleaned) {
      localStorage.setItem('backend_api_url', cleaned)
      showToast('บันทึก Backend URL เรียบร้อยแล้ว', 'success')
    } else {
      localStorage.removeItem('backend_api_url')
      showToast('ใช้ Backend ค่าเริ่มต้น', 'info')
    }
    setShowServerModal(false)
  }

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (conversionResult?.blobUrl) {
        URL.revokeObjectURL(conversionResult.blobUrl)
      }
    }
  }, [conversionResult])

  return (
    <div className="yt-converter-container">
      {/* Backend Settings Modal */}
      {showServerModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowServerModal(false)}
        >
          <div 
            className="glass-card" 
            style={{ 
              maxWidth: '420px', 
              width: '100%', 
              backgroundColor: '#ffffff', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              padding: '20px',
              borderRadius: '14px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={16} /> ตั้งค่าเซิร์ฟเวอร์ Backend (Render)
              </div>
              <button 
                type="button" 
                className="remove-btn" 
                onClick={() => setShowServerModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 12px 0' }}>
              หากเปิดใช้งานผ่าน Vercel ให้ระบุ URL ของ Render Web Service ที่ Deploy ไว้ (เช่น <code>https://mp4-xxxx.onrender.com</code>)
            </p>

            <input
              type="text"
              className="yt-url-input"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px', fontSize: '13px' }}
              placeholder="https://your-service.onrender.com"
              value={backendUrlInput}
              onChange={(e) => setBackendUrlInput(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => handleSaveBackendUrl('')}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                ค่าเริ่มต้น
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={() => handleSaveBackendUrl(backendUrlInput)}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Paste YouTube / YouTube Music Link */}
      <div className="glass-card active-card">
        <div className="card-step step-active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="step-num">1</div>
            <div className="step-title">วางลิงก์ YouTube หรือ YouTube Music</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowServerModal(true)}
              title="ตั้งค่าเซิร์ฟเวอร์ Backend"
              style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
            >
              <Settings size={13} />
              {getApiBaseUrl() ? 'Backend: เชื่อมแล้ว' : 'Backend'}
            </button>
            {videoData && (
              <button className="remove-btn" onClick={handleReset} title="เริ่มใหม่">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="yt-input-group">
          <div className="yt-input-wrapper">
            <Link size={18} className="yt-input-icon" />
            <input
              ref={inputRef}
              type="text"
              className="yt-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') processUrl(e.target.value)
              }}
              placeholder="วางลิงก์ เช่น https://music.youtube.com/... หรือ youtu.be/..."
            />
            {url && (
              <button 
                type="button" 
                className="yt-clear-btn" 
                onClick={() => setUrl('')}
                title="ล้างข้อความ"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="yt-input-actions">
            <button
              type="button"
              className="btn-secondary yt-paste-btn"
              onClick={handlePasteClipboard}
            >
              <Clipboard size={14} /> วางจากคลิปบอร์ด
            </button>

            <button
              type="button"
              className="btn-primary yt-fetch-btn"
              onClick={() => processUrl(url)}
              disabled={loadingInfo || !url.trim()}
            >
              {loadingInfo ? (
                <>
                  <div className="spinner" style={{ marginRight: '4px' }}></div>
                  กำลังดึงข้อมูล...
                </>
              ) : (
                <>
                  <Sparkles size={15} /> ดึงข้อมูลเพลง
                </>
              )}
            </button>
          </div>
        </div>

        <div className="yt-supported-badges">
          <span className="yt-pill">YouTube Music</span>
          <span className="yt-pill">YouTube Video</span>
          <span className="yt-pill">Shorts</span>
          <span className="yt-pill">youtu.be</span>
        </div>
      </div>

      {/* STEP 2: Song Info, Artist & Custom Filename */}
      {videoData && (
        <div className="glass-card active-card">
          <div className="card-step step-active">
            <div className="step-num">2</div>
            <div className="step-title">ข้อมูลเพลงและชื่อไฟล์ที่จะเซฟ</div>
          </div>

          {/* Video Thumbnail & Original Metadata Banner */}
          <div className="yt-video-card">
            <div className="yt-thumb-wrapper">
              <img
                src={videoData.thumbnail}
                alt={videoData.title}
                className="yt-thumbnail"
                onError={(e) => {
                  e.target.src = `https://i.ytimg.com/vi/${videoData.videoId}/hqdefault.jpg`
                }}
              />
              <div className="yt-thumb-badge">
                <Music size={12} /> เพลงเต็ม
              </div>
            </div>

            <div className="yt-meta-content">
              <div className="yt-meta-title" title={videoData.title}>
                {videoData.cleanTitle || videoData.title}
              </div>
              <div className="yt-meta-channel">
                ช่อง: <b>{videoData.author}</b>
              </div>
            </div>
          </div>

          {/* Form for Song Title & Artist */}
          <div className="yt-form-grid">
            <div className="yt-field">
              <label className="yt-label">
                🎵 ชื่อเพลง (Song Title)
              </label>
              <input
                type="text"
                className="yt-text-input"
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                placeholder="ระบุชื่อเพลง..."
              />
            </div>

            <div className="yt-field">
              <label className="yt-label">
                👤 ชื่อศิลปิน (Artist Name)
              </label>
              <input
                type="text"
                className="yt-text-input"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="ระบุชื่อศิลปิน..."
              />
            </div>
          </div>

          {/* Quick Swap Button */}
          <button
            type="button"
            className="btn-secondary yt-swap-btn"
            onClick={handleSwapArtistTitle}
          >
            <ArrowLeftRight size={13} /> สลับ "ชื่อเพลง" ↔ "ศิลปิน"
          </button>

          {/* Naming Format Selector */}
          <div className="yt-naming-section">
            <label className="yt-label" style={{ marginBottom: '8px' }}>
              รูปแบบชื่อไฟล์ที่ต้องการ:
            </label>
            <div className="yt-format-pills">
              <button
                type="button"
                className={`yt-format-pill ${namingFormat === 'artist_title' ? 'active' : ''}`}
                onClick={() => setNamingFormat('artist_title')}
              >
                ศิลปิน - ชื่อเพลง
              </button>
              <button
                type="button"
                className={`yt-format-pill ${namingFormat === 'title_artist' ? 'active' : ''}`}
                onClick={() => setNamingFormat('title_artist')}
              >
                ชื่อเพลง - ศิลปิน
              </button>
              <button
                type="button"
                className={`yt-format-pill ${namingFormat === 'title_only' ? 'active' : ''}`}
                onClick={() => setNamingFormat('title_only')}
              >
                เฉพาะชื่อเพลง
              </button>
              <button
                type="button"
                className={`yt-format-pill ${namingFormat === 'custom' ? 'active' : ''}`}
                onClick={() => setNamingFormat('custom')}
              >
                กำหนดเอง
              </button>
            </div>

            {/* Live Filename Preview / Custom Input */}
            <div className="yt-filename-preview-box">
              <label className="yt-sublabel">
                📁 ชื่อไฟล์ตอนดาวน์โหลดลงเครื่อง:
              </label>
              <div className="yt-filename-input-wrap">
                <input
                  type="text"
                  className="yt-filename-input"
                  value={customFilename}
                  onChange={(e) => {
                    setCustomFilename(e.target.value)
                    setNamingFormat('custom')
                  }}
                  placeholder="ชื่อไฟล์ที่จะเซฟ..."
                />
                <span className="yt-ext-badge">.mp3</span>
              </div>
            </div>
          </div>

          {/* Audio Bitrate Selector */}
          <div className="yt-bitrate-section">
            <label className="yt-label" style={{ marginBottom: '8px' }}>
              คุณภาพเสียง (Bitrate):
            </label>
            <div className="yt-bitrate-grid">
              {[
                { value: '320', label: '320 kbps', desc: 'คุณภาพสูงสุด (Ultra HQ)' },
                { value: '256', label: '256 kbps', desc: 'คุณภาพสูง (High)' },
                { value: '192', label: '192 kbps', desc: 'มาตรฐาน (Standard)' },
                { value: '128', label: '128 kbps', desc: 'ประหยัดพื้นที่ (Fast)' }
              ].map((item) => (
                <div
                  key={item.value}
                  className={`yt-bitrate-item ${bitrate === item.value ? 'selected' : ''}`}
                  onClick={() => setBitrate(item.value)}
                >
                  <div className="yt-bitrate-val">{item.label}</div>
                  <div className="yt-bitrate-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Convert & Download */}
      {videoData && (
        <div className="glass-card active-card">
          <div className="card-step step-active">
            <div className="step-num">3</div>
            <div className="step-title">แปลงและดาวน์โหลดเป็นไฟล์ MP3 ทั้งเพลง</div>
          </div>

          {/* Action Button: Convert and Download directly inside website */}
          {!conversionResult && !converting && (
            <button
              type="button"
              className="btn-primary yt-convert-main-btn"
              onClick={handleStartConversion}
              disabled={converting}
            >
              <Download size={18} />
              <span>แปลงและดาวน์โหลด MP3 ลงเครื่อง ({bitrate} kbps)</span>
            </button>
          )}

          {/* Converting & Live Progress Bar */}
          {converting && (
            <div className="progress-container">
              <div className="progress-header">
                <span>{statusMessage}</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="yt-converting-tip">
                กำลังดึงเสียงจาก YouTube และแปลงเข้ารหัสเป็นไฟล์ MP3 ในเครื่อง กรุณารอสักครู่...
              </p>
            </div>
          )}

          {/* Success Download Block */}
          {conversionResult?.success && !converting && (
            <div className="result-box">
              <div className="success-alert">
                <Check size={18} />
                <span>แปลงไฟล์สำเร็จ และบันทึกไฟล์ MP3 ลงเครื่องเรียบร้อยแล้ว!</span>
              </div>

              {/* In-app Audio Preview Player */}
              {conversionResult.blobUrl && (
                <div className="yt-audio-player-card">
                  <div className="yt-audio-player-meta">
                    <Disc size={16} className="spin-slow" />
                    <span>ฟังเพลงที่แปลงเสร็จทันทีในเว็บ</span>
                  </div>
                  <audio
                    src={conversionResult.blobUrl}
                    controls
                    className="output-audio"
                  />
                </div>
              )}

              {/* File Info Card */}
              <div className="file-badge">
                <FileAudio size={22} className="file-badge-icon" />
                <div className="file-meta">
                  <div className="file-name">{conversionResult.filename}</div>
                  <div className="file-size">
                    รูปแบบ: MP3 · {bitrate} kbps · ความยาวทั้งเพลง
                  </div>
                </div>
              </div>

              {/* Native Download Anchor (Guaranteed to download into user's Downloads folder) */}
              <a
                href={conversionResult.blobUrl}
                download={conversionResult.filename}
                className="btn-download"
              >
                <Download size={18} /> ดาวน์โหลดไฟล์อีกครั้ง ({conversionResult.filename})
              </a>

              <div className="yt-result-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCopyFilename}
                >
                  {copiedName ? <Check size={14} style={{ color: '#10b981' }} /> : <Clipboard size={14} />}
                  {copiedName ? 'คัดลอกชื่อแล้ว!' : 'คัดลอกชื่อไฟล์'}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleReset}
                >
                  <RefreshCw size={14} /> แปลงเพลงอื่นต่อ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
