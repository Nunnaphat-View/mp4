/**
 * YouTube & YouTube Music Utilities
 * Parsing, Metadata extraction via oEmbed, Title/Artist detection, and Audio conversion
 */
import { transcodeToMp3 } from './ffmpeg'

// Regular expressions to match YouTube and YouTube Music URLs
const YT_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/)|music\.youtube\.com\/watch\?v=)([^#&?]{11})/i;

/**
 * Extracts 11-character video ID from a YouTube or YouTube Music URL
 * @param {string} input 
 * @returns {string|null}
 */
export function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  
  // Direct 11-char ID check (letters, numbers, hyphen, underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  
  const match = trimmed.match(YT_REGEX);
  return match ? match[1] : null;
}

/**
 * Sanitizes a string for use as a filesystem file name
 * @param {string} name 
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name) return 'audio';
  return name
    .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid filename characters
    .replace(/\s+/g, ' ')           // Collapse multiple whitespace
    .trim();
}

/**
 * Intelligent parser to separate artist name and song title from raw YouTube title & channel
 * @param {string} rawTitle 
 * @param {string} rawChannel 
 * @returns {{ artist: string, songTitle: string, cleanTitle: string }}
 */
export function parseTitleAndArtist(rawTitle, rawChannel) {
  let title = (rawTitle || '').trim();
  let channel = (rawChannel || '').replace(/ - Topic$/i, '').trim();

  // Noise patterns to strip out from music video titles
  const noisePatterns = [
    /\s*[[(](?:Official\s*(?:Music\s*)?(?:Video|Audio|MV|Lyric\s*Video|Visualizer|Teaser)?|MV|Lyrics?|HD|4K|Audio|Visualizer|Live\s*Performance|Special\s*Clip|Performance\s*Video)[)\]]/gi,
    /\s*\|\s*Official\s*(?:Music\s*)?(?:Video|Audio|MV|Lyric\s*Video|Visualizer).*/gi,
    /\s*\|\s*MV.*/gi,
    /\s*【Official\s*MV】/gi,
    /\s*「Official\s*MV」/gi,
    /\s*\[\s*(?:MV|Lyrics?|HD|4K)\s*\]/gi,
    /\s*\(?4K\)?/gi,
    /\s*\(?HD\)?/gi,
    /\s*\(?Full\s*Song\)?/gi,
    /\s*\(?Official\)?/gi,
  ];

  let cleaned = title;
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  let artist = channel;
  let songTitle = cleaned;

  // Check if title has separators like "Artist - Title" or "Title - Artist"
  const sepMatch = cleaned.match(/^(.*?)\s*[-–—|:]\s*(.*)$/);
  if (sepMatch) {
    const part1 = sepMatch[1].trim();
    const part2 = sepMatch[2].trim();

    // If part1 matches channel name, then part1 is definitely artist
    if (channel && (part1.toLowerCase().includes(channel.toLowerCase()) || channel.toLowerCase().includes(part1.toLowerCase()))) {
      artist = part1;
      songTitle = part2;
    } else if (channel && (part2.toLowerCase().includes(channel.toLowerCase()) || channel.toLowerCase().includes(part2.toLowerCase()))) {
      // Sometimes it's "Song - Artist"
      artist = part2;
      songTitle = part1;
    } else {
      // Default industry standard convention for YouTube: Artist - Song
      artist = part1;
      songTitle = part2;
    }
  }

  // Remove wrapping quotes or brackets from song title / artist
  songTitle = songTitle.replace(/^["'「『](.*)["'」』]$/, '$1').trim();
  artist = artist.replace(/^["'「『](.*)["'」』]$/, '$1').trim();

  // Fallback if song title or artist ended up empty
  if (!songTitle && cleaned) songTitle = cleaned;
  if (!artist) artist = channel || 'Unknown Artist';

  return {
    artist,
    songTitle,
    cleanTitle: cleaned || rawTitle
  };
}

/**
 * Fetch video metadata from YouTube official oEmbed endpoint (CORS supported by YouTube)
 * @param {string} videoId 
 * @returns {Promise<{ title: string, author: string, thumbnail: string, videoId: string, songTitle: string, artist: string }>}
 */
export async function fetchYouTubeMetadata(videoId) {
  if (!videoId) throw new Error('Video ID is required');

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(standardUrl)}&format=json`;

  const res = await fetch(oembedUrl);
  if (!res.ok) {
    throw new Error('ไม่พบข้อมูลวีดีโอจาก YouTube กรุณาตรวจสอบลิงก์อีกครั้ง');
  }

  const data = await res.json();
  const { artist, songTitle, cleanTitle } = parseTitleAndArtist(data.title, data.author_name);

  // Preferred thumbnail: hqdefault.jpg
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title: data.title,
    author: data.author_name,
    thumbnail,
    cleanTitle,
    songTitle,
    artist,
    sourceUrl: standardUrl
  };
}

/**
 * Reads a ReadableStream into a single Uint8Array while reporting progress
 */
async function readStreamWithProgress(response, onProgress) {
  const reader = response.body.getReader();
  const contentLength = +response.headers.get('Content-Length') || 0;
  let receivedLength = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;

    const mb = (receivedLength / (1024 * 1024)).toFixed(1);
    if (contentLength) {
      const pct = Math.round((receivedLength / contentLength) * 100);
      onProgress(`กำลังดาวน์โหลดไฟล์เสียงจาก YouTube... (${mb} MB / ${pct}%)`);
    } else {
      onProgress(`กำลังดาวน์โหลดไฟล์เสียงจาก YouTube... (${mb} MB)`);
    }
  }

  const allChunks = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  return allChunks;
}

/**
 * Get current API backend base URL (supports custom URL or VITE_API_URL environment variable)
 */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('backend_api_url');
    if (custom) return custom.trim().replace(/\/$/, '');
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.trim().replace(/\/$/, '');
  return '';
}

/**
 * Fetches the audio stream directly from our backend proxy (YouTube InnerTube / yt-dlp API)
 * @param {string} videoId 
 * @param {function} onProgress 
 * @returns {Promise<{ rawBuffer: Uint8Array, isMp3: boolean }>}
 */
async function fetchAudioSource(videoId, onProgress) {
  onProgress('กำลังเชื่อมต่อดึงไฟล์เสียงจาก YouTube โดยตรง...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout for full song

  try {
    const apiBase = getApiBaseUrl();
    const endpoint = `${apiBase}/api/yt-convert?videoId=${videoId}`;

    const response = await fetch(endpoint, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = 'เซิร์ฟเวอร์ปฏิเสธการดาวน์โหลด';
      if (response.status === 404 && !apiBase && typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
        errorMsg = 'ไม่พบ Backend บน Vercel กรุณาเปิดใช้งานผ่าน Render หรือตั้งค่า Backend URL';
      } else {
        try {
          const errJson = await response.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch {
          // Ignored
        }
      }
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    const rawBuffer = await readStreamWithProgress(response, onProgress);

    if (!rawBuffer || rawBuffer.byteLength < 10000) {
      let specificError = '';
      if (rawBuffer && rawBuffer.byteLength > 0) {
        try {
          const text = new TextDecoder().decode(rawBuffer);
          if (text.startsWith('{')) {
            const parsed = JSON.parse(text);
            if (parsed.error) specificError = parsed.error;
          } else if (text.includes('error') || text.includes('Error') || text.includes('404')) {
            specificError = text.slice(0, 150);
          }
        } catch {
          // ignore
        }
      }
      throw new Error(specificError || 'ไฟล์เสียงที่ได้รับมีขนาดไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง');
    }

    return {
      rawBuffer,
      isMp3: contentType.includes('mpeg') || contentType.includes('mp3')
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('การดาวน์โหลดใช้เวลานานเกินกำหนด กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    }
    throw err;
  }
}

/**
 * Converts YouTube video to MP3 directly inside this website
 * @param {string} videoId 
 * @param {string} filename 
 * @param {string} bitrate ('320', '256', '192', '128')
 * @param {function} onProgress 
 * @returns {Promise<{ success: boolean, blobUrl: string, filename: string }>}
 */
export async function convertToMp3(videoId, filename, bitrate = '320', onProgress = () => {}) {
  const safeFilename = sanitizeFilename(filename) + '.mp3';

  // Step 1: Download raw audio stream from YouTube directly
  const { rawBuffer, isMp3 } = await fetchAudioSource(videoId, onProgress);

  let finalMp3Blob;

  // Step 2: Transcode to genuine MP3 using in-browser WebAssembly FFmpeg
  if (isMp3) {
    onProgress('ไฟล์เสียงเป็น MP3 สมบูรณ์แล้ว กำลังสร้างไฟล์ดาวน์โหลด...');
    finalMp3Blob = new Blob([rawBuffer], { type: 'audio/mpeg' });
  } else {
    onProgress(`กำลังแปลงไฟล์เป็น MP3 คุณภาพสูง ${bitrate} kbps ผ่านระบบในเครื่อง...`);
    finalMp3Blob = await transcodeToMp3(rawBuffer, bitrate, onProgress, () => {});
  }

  // Step 3: Create Blob URL for local browser saving
  const blobUrl = URL.createObjectURL(finalMp3Blob);
  onProgress('แปลงไฟล์ MP3 สำเร็จเรียบร้อย!');

  return {
    success: true,
    blobUrl,
    filename: safeFilename
  };
}
