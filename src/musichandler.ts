import SpotifyWebApi from "spotify-web-api-node"
import { 
  createAudioPlayer, 
  createAudioResource, 
  joinVoiceChannel, 
  AudioPlayerStatus,
  VoiceConnection,
  AudioPlayer,
  AudioResource,
  VoiceConnectionStatus,
  entersState,
  StreamType
} from '@discordjs/voice'
import prism from "prism-media"
import { VoiceChannel, GuildMember } from 'discord.js'
import fetch from "node-fetch"
import {exec} from "child_process"
import fs, { write } from "fs"
import { promisify } from "util"
import path from "path"

const execAsync = promisify(exec)
const musicDir = path.resolve('musics')

// Interface untuk data track
interface SpotifyTrackInfo {
  title: string
  artist: string
  album: string
  duration: number
  durationFormatted: string
  cover: string | null
  url: string
  preview: string | null
  popularity: number
  explicit: boolean
  releaseDate: string
}

// Interface untuk error handling
interface SpotifyError {
  success: false
  error: string
  data?: any
  details?: any
}

interface SpotifySuccess {
  success: true
  data: SpotifyTrackInfo
}

interface MusicFormatJson {
  title: string
  linkYt: string
  date?: Date
}

type SpotifyResult = SpotifySuccess | SpotifyError
const historyMusicFile = "musics/history.json"

class SpotifyService {
  public spotifyApi: SpotifyWebApi
  public tokenExpiry: number = 0

  constructor() {
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env["SPOTIFY_CLIENT_ID"],
      clientSecret: process.env["SPOTIFY_CLIENT_SECRET"],
    })
  }

  // Validasi environment variables
  public validateConfig(): boolean {
    if (!process.env["SPOTIFY_CLIENT_ID"] || !process.env["SPOTIFY_CLIENT_SECRET"]) {
      console.error('❌ Spotify Client ID atau Client Secret tidak ditemukan di environment variables')
      return false
    }
    return true
  }

  // Get atau refresh access token
  public async ensureValidToken(): Promise<boolean> {
    try {
      // Cek apakah token masih valid (dengan buffer 5 menit)
      if (Date.now() < this.tokenExpiry - 300000) {
        return true
      }

      console.log('🔄 Mendapatkan access token baru...')
      const tokenResponse = await this.spotifyApi.clientCredentialsGrant()
      
      this.spotifyApi.setAccessToken(tokenResponse.body.access_token)
      // Set expiry time (default 1 hour)
      this.tokenExpiry = Date.now() + (tokenResponse.body.expires_in * 1000)
      
      console.log('✅ Access token berhasil didapatkan')
      return true
    } catch (error) {
      console.error('❌ Error getting access token:', error)
      return false
    }
  }

  // Extract track ID dari berbagai format URL Spotify
  public extractTrackId(url: string): string | null {
    const patterns = [
      /spotify:track:([a-zA-Z0-9]+)/,
      /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/,
      /spotify\.com\/track\/([a-zA-Z0-9]+)/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) return match[1]
    }

    return null
  }

  // Format durasi dari ms ke mm:ss
  public formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Search tracks berdasarkan nama judul
  async searchTrackByName(query: string, limit: number = 10): Promise<SpotifyResult | { success: true, data: SpotifyTrackInfo[] }> {
    try {
      // Validasi config
      if (!this.validateConfig()) {
        return {
          success: false,
          error: 'Konfigurasi Spotify tidak valid'
        }
      }

      // Pastikan token valid
      const tokenValid = await this.ensureValidToken()
      if (!tokenValid) {
        return {
          success: false,
          error: 'Gagal mendapatkan access token'
        }
      }

      // Search tracks
      console.log(`🔍 Mencari lagu: "${query}"...`)
      const searchResponse = await this.spotifyApi.searchTracks(query, { limit })
      const tracks = searchResponse.body.tracks?.items || []

      if (tracks.length === 0) {
        return {
          success: false,
          error: `Tidak ada lagu yang ditemukan dengan kata kunci: "${query}"`
        }
      }

      // Convert ke format SpotifyTrackInfo
      const results: SpotifyTrackInfo[] = tracks.map(track => ({
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        album: track.album.name,
        duration: track.duration_ms,
        durationFormatted: this.formatDuration(track.duration_ms),
        cover: track.album.images[0]?.url || null,
        url: track.external_urls.spotify,
        preview: track.preview_url,
        popularity: track.popularity,
        explicit: track.explicit,
        releaseDate: track.album.release_date,
      }))

      return {
        success: true,
        data: results
      }

    } catch (error: any) {
      console.error('❌ Error searching tracks:', error)
      return {
        success: false,
        error: 'Gagal mencari lagu di Spotify',
        details: error?.body?.error
      }
    }
  }

  // Main function untuk get track info (by URL or search by name)
  async getTrackInfo(input: string): Promise<SpotifyResult> {
    try {
      // Validasi config
      if (!this.validateConfig()) {
        return {
          success: false,
          error: 'Konfigurasi Spotify tidak valid'
        }
      }

      // Cek apakah input adalah URL atau nama lagu
      const trackId = this.extractTrackId(input)
      
      if (trackId) {
        // Jika input adalah URL, ambil track by ID
        console.log(`🎵 Mengambil info track dari URL: ${trackId}...`)
        return await this.getTrackById(trackId)
      } else {
        // Jika input bukan URL, search by name dan ambil hasil pertama
        console.log(`🔍 Mencari lagu dengan nama: "${input}"...`)
        const searchResult = await this.searchTrackByName(input, 1)
        
        if (searchResult.success && Array.isArray(searchResult.data)) {
          if (searchResult.data.length > 0) {
            const trackInfo = searchResult.data[0]
            if (trackInfo) {
              return {
                success: true,
                data: trackInfo
              }
            } else {
              return {
                success: false,
                error: `Lagu "${input}" tidak ditemukan`
              }
            }
          } else {
            return {
              success: false,
              error: `Lagu "${input}" tidak ditemukan`
            }
          }
        } else {
          return searchResult as SpotifyResult
        }
      }

    } catch (error: any) {
      console.error('❌ Error getting track info:', error)
      return {
        success: false,
        error: 'Terjadi error saat mengambil info lagu',
        details: error?.body?.error
      }
    }
  }

  // Helper method untuk get track by ID
  public async getTrackById(trackId: string): Promise<SpotifyResult> {
    try {
      // Pastikan token valid
      const tokenValid = await this.ensureValidToken()
      if (!tokenValid) {
        return {
          success: false,
          error: 'Gagal mendapatkan access token'
        }
      }

      // Get track data
      const trackResponse = await this.spotifyApi.getTrack(trackId)
      const track = trackResponse.body

      // Build result object
      const result: SpotifyTrackInfo = {
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        album: track.album.name,
        duration: track.duration_ms,
        durationFormatted: this.formatDuration(track.duration_ms),
        cover: track.album.images[0]?.url || null,
        url: track.external_urls.spotify,
        preview: track.preview_url,
        popularity: track.popularity,
        explicit: track.explicit,
        releaseDate: track.album.release_date,
      }

      return {
        success: true,
        data: result
      }

    } catch (error: any) {
      console.error('❌ Error getting track by ID:', error)
      
      let errorMessage = 'Terjadi error tidak dikenal'
      
      if (error?.body?.error) {
        switch (error.body.error.status) {
          case 400:
            errorMessage = 'Request tidak valid'
            break
          case 401:
            errorMessage = 'Token tidak valid atau expired'
            break
          case 404:
            errorMessage = 'Track tidak ditemukan'
            break
          case 429:
            errorMessage = 'Rate limit exceeded'
            break
          default:
            errorMessage = error.body.error.message || 'Spotify API error'
        }
      }

      return {
        success: false,
        error: errorMessage,
        details: error?.body?.error
      }
    }
  }

  // Helper method untuk test multiple inputs (URLs atau nama lagu)
  async testMultipleInputs(inputs: string[]): Promise<void> {
    console.log(`🧪 Testing ${inputs.length} Spotify inputs...\n`)
    
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      const isUrl = this.extractTrackId(input!) !== null
      
      console.log(`[${i + 1}/${inputs.length}] Testing ${isUrl ? 'URL' : 'Search'}: ${input}`)
      
      const result = await this.getTrackInfo(input!)
      
      if (result.success) {
        console.log('✅ Success:')
        console.log(`   🎵 ${result.data.title}`)
        console.log(`   👤 ${result.data.artist}`)
        console.log(`   💽 ${result.data.album}`)
        console.log(`   ⏱️  ${result.data.durationFormatted}`)
        console.log(`   📈 Popularity: ${result.data.popularity}/100`)
        console.log(`   🔗 ${result.data.url}`)
      } else {
        console.log(`❌ Failed: ${result.error}`)
        if (result.details) {
          console.log(`   Details:`, result.details)
        }
      }
      
      console.log('') // Empty line for separation
    }
  }

  // Test search dengan multiple results
  async testSearch(query: string, limit: number = 5): Promise<void> {
    console.log(`🔍 Searching for: "${query}" (limit: ${limit})\n`)
    
    const result = await this.searchTrackByName(query, limit)
    
    if (result.success && Array.isArray(result.data)) {
      console.log(`✅ Found ${result.data.length} results:\n`)
      
      result.data.forEach((track, index) => {
        console.log(`[${index + 1}] 🎵 ${track.title}`)
        console.log(`    👤 ${track.artist}`)
        console.log(`    💽 ${track.album}`)
        console.log(`    ⏱️  ${track.durationFormatted} | 📈 ${track.popularity}/100`)
        console.log(`    🔗 ${track.url}`)
        console.log('')
      })
    } else {
      console.log(`❌ Search failed: ${result.data.error}`)
    }
  }
}

// Export default function untuk testing
export default async function testSpotify() {
  const spotifyService = new SpotifyService()
  
  // Test URLs - berbagai format
  const testUrls = [
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=abc123",
    "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    "https://spotify.com/track/0VjIjW4GlULA4LGgAw5mVU",
    "Otonoke", // Test error case
  ]

  try {
    // Test single URL
    console.log('='.repeat(50))
    console.log('🎧 SPOTIFY API TEST')
    console.log('='.repeat(50))
    
    const singleResult = await spotifyService.getTrackInfo(testUrls[0]!)
    
    if (singleResult.success) {
      console.log('✅ Single URL Test - SUCCESS')
      console.log('Track Info:', JSON.stringify(singleResult.data, null, 2))
    } else {
      console.log('❌ Single URL Test - FAILED')
      console.log('Error:', singleResult.error)
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('📋 MULTIPLE URLs TEST')
    console.log('='.repeat(50))
    
    // Test multiple URLs
    await spotifyService.testMultipleInputs(testUrls)
    
    console.log('🎉 Test completed!')
    
  } catch (error) {
    console.error('💥 Fatal error during test:', error)
  }
}

// Export class untuk digunakan di tempat lain
export { SpotifyService }

export class YoutubeMusicPlayer {
  public player: AudioPlayer
  public connection: VoiceConnection | null = null
  public currentResource: any = null
  public isPlaying: boolean = false
  public YT_API_KEY: string
  public looping: boolean = false
  public lastTrack: { url: string, title: string } | null = null
  public streamUrl: string | null = null
  private lastFilePath: any

  constructor() {
    this.player = createAudioPlayer()
    this.player.on(AudioPlayerStatus.Idle, async () => {
      if (this.looping && this.lastFilePath) {
        console.log(`🔁 Looping: ${this.lastFilePath}`)
        const stream = fs.createReadStream(this.lastFilePath)
        this.currentResource = createAudioResource(stream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
          metadata: this.lastFilePath,
        })
        this.currentResource.volume.setVolume(1.2)
        this.player.play(this.currentResource)
      }
    })
    this.YT_API_KEY = process.env["YT_API_KEY"] || ''
    console.log(this.YT_API_KEY)
    // this.setupPlayerListeners()
  }

  public setupPlayerListeners(): void {
    this.player.on(AudioPlayerStatus.Playing, () => {
      this.isPlaying = true
      console.log('▶️ Now playing audio')
    })

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false
      console.log('⏹️ Playback ended')
      this.cleanup()
    })

    this.player.on(AudioPlayerStatus.Buffering, () => {
      console.log('⏳ Buffering audio...')
    })

    this.player.on('error', (error) => {
      console.error('❌ Audio player error:', error)
      this.isPlaying = false
      this.cleanup()
    })
  }

 async join(voiceChannel: VoiceChannel): Promise<boolean> {
    if (this.connection) {
      this.connection.destroy()
      this.connection = null
    }
    this.setupPlayerListeners()

    console.log(`🎧 Trying to join voice channel: ${voiceChannel.name}`)

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    })

    // Log tiap state biar kelihatan progresnya
    this.connection.on("stateChange", (oldState, newState) => {
      console.log(`🔄 Voice connection: ${oldState.status} → ${newState.status}`)
    })

    try {
      await entersState(this.connection, VoiceConnectionStatus.Signalling, 10_000)
        .catch(() => console.warn("⚠️ Still signalling... continuing"))

      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000)
      console.log(`✅ Connected to voice channel: ${voiceChannel.name}`)

      this.connection.subscribe(this.player)
      console.log("🎵 Player subscribed successfully.")
      return true
    } catch (error) {
      console.error("❌ Failed to join voice channel:", error)

      if (this.connection) {
        this.connection.destroy()
        this.connection = null
      }
      return false
    }
  }

  public isValidUrl(string: string): boolean {
    try {
      new URL(string)
      return true
    } catch {
      return false
    }
  }

  async searchWithYtDLP(query: string): Promise<string | null> {
    try {
      console.log("🔍 Searching with yt-dlp for:", query)
      const { stdout } = await execAsync(`yt-dlp "ytsearch:${query}" --get-id --get-title`) as any
      const [title, id] = stdout.trim().split('\n')
      if (!id) throw new Error("ID tidak ditemukan")
      console.log({ title, id })
      this.writeNewMusic( title,`https://www.youtube.com/watch?v=${id}`)
      return `https://www.youtube.com/watch?v=${id}`
    } catch (error) {
      console.error("❌ Failed to search with yt-dlp:", error)
      return null
    }
  }

  async searchYoutubeAPI(query: string): Promise<string | null> {
    try {
      let res
      console.log("🔍 Searching YouTube API for:", query)

      const params = new URLSearchParams({
        part: "snippet",
        q: query,
        maxResults: "1",
        type: "video", // hanya ambil video
        key: this.YT_API_KEY!,
      })

      const finalUrl = `https://www.googleapis.com/youtube/v3/search?${params}`
      console.log("🔗 Final URL:", finalUrl)
      res = await fetch(finalUrl)
      if (!res.ok){ throw new Error(res.statusText) }

      const data = await res?.json() as any

      if (data.items && data.items.length > 0) {
        const video = data.items[0]
        const videoId = video.id.videoId
        const title = video.snippet.title
        console.log(`✅ Found: ${title}`)
        this.writeNewMusic(title,`https://www.youtube.com/watch?v=${videoId}`)
        return `https://www.youtube.com/watch?v=${videoId}`
      }

      console.warn("⚠️ No video found for:", query)
      return null
    } catch (error: any) {
      console.error("❌ YouTube API error:", error.message || error)
      return null
    }
  }

  async play(input: string): Promise<{ success: boolean, title?: string, error?: string }> {
    try {
      let url = input
      let title = input
      let searchResult: string | null = null

      // If not a URL, search YouTube
      if (!this.isValidUrl(input)) {
        // console.log(`🔍 Searching for: ${input}`)
        searchResult = await this.searchYoutubeAPI(input)
        console.log(searchResult)
        if (!searchResult) {
          console.log("Cari pakai yt-dlp")
          searchResult = await this.searchWithYtDLP(input) as any
          console.log("Search result:", searchResult)
          if (!searchResult) {
            return { success: false, error: 'Tidak dapat menemukan musik ', title: input }
          }
          url = await searchResult
          // return { success: false, error: 'Tidak dapat menemukan musik tersebut' }
        }
        url = await searchResult
      }

      // Get video info
      try {        

        const filePath = await this.downloadMusic(url)
        this.lastFilePath = filePath
        if (!filePath) return { success: false, error: 'Gagal download musik', title }

        const stream = fs.createReadStream(filePath)

        this.currentResource = createAudioResource(stream as any, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
          metadata: { title }
        })

        // Set initial volume
        if (this.currentResource.volume) {
          this.currentResource.volume.setVolume(1.2)
        }

        // Play the resource
        this.player.play(this.currentResource)
        this.lastTrack = { url, title: title || 'Unknown' }
        console.log("Last Track Metadata: ", this.lastTrack)
        console.log(`🎵 Now playing: ${title}`)
        this.player.on(AudioPlayerStatus.Playing, () => console.log("🎶 Playing audio..."))
        this.player.on(AudioPlayerStatus.Idle, () => console.log("🛑 Audio ended."))
        this.player.on("error", e => console.error("Audio player error:", e))


        return { success: true, title }
      } catch (error) {
        console.error('❌ Error getting video info:', error)
        return { success: false, error: 'Gagal mendapatkan info musik' }
      }
    } catch (error) {
      console.error('❌ Play error:', error)
      return { success: false, error: 'Gagal memutar musik' }
    }
  }

  ensureMusicDir() {
    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, { recursive: true })
    }
  }

  async streamAudio(url: string): Promise<any> {
    // misalnya fetch stream dari endpoint Express /youtube kamu
    const res = await fetch(`http://localhost:3000/youtube?url=${encodeURIComponent(url)}`)
    const data = await res.json() as any
    console.log(data)
    const audioStream = data.stream
    return audioStream
  }
  
  readHistory(){
    try {
      console.log("Folder path: ", historyMusicFile)
      if (!fs.existsSync(historyMusicFile)) {
        return []
      }
      const data = fs.readFileSync(historyMusicFile, 'utf8')
      if (!data.trim()) { // kalau file kosong
        return []
      }
      return JSON.parse(data)
    }
      catch (err) {
        console.error(err)
        return []
    }
  }
  
  getCurrentDateTime() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }
  
  
  writeNewMusic(title: string, linkYt: string) {
    const historyFile = path.resolve('music_history.json')
    const timestamp = this.getCurrentDateTime()
    const [date, time] = timestamp.split(' ')

    let musicList: any[] = []
    if (fs.existsSync(historyFile)) {
      musicList = JSON.parse(fs.readFileSync(historyFile, 'utf-8'))
    }

    if (musicList.some((m) => m.linkYt === linkYt)) {
      console.log('⚠️ Music already in history')
      return
    }

    const entry = { musicData: title, linkYt, date, time }
    musicList.push(entry)
    fs.writeFileSync(historyFile, JSON.stringify(musicList, null, 2), 'utf-8')
  }

   // ✅ Download jika file belum ada
  async downloadMusic(url: string): Promise<string | null> {
    this.ensureMusicDir()

    try {
      // clear cache
      execAsync('yt-dlp --rm-cache-dir')

      // ambil info dulu buat tau judul & nama file
      const info = await execAsync(`yt-dlp -e ${url}`)
      const rawTitle = info.stdout.trim()

      // ubah karakter ilegal jadi spasi atau strip aja
      const title = rawTitle
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // hapus karakter ilegal
      .replace(/\s+/g, ' ') // rapikan spasi berlebih
      .replace(/\.+$/, '') // hapus titik di akhir
      .trim() || 'Unknown_Song'

      const filePath = path.join(musicDir, `${title}.mp3`)

      // kalau udah ada, skip download
      if (fs.existsSync(filePath)) {
        console.log('🎵 File sudah ada:', filePath)
        return filePath
      }

      console.log('⬇️ Downloading:', title)
      await execAsync(
        `yt-dlp --extract-audio --audio-format mp3 -o "${filePath}" ${url}`
      )

      console.log('✅ Download complete:', filePath)
      return filePath
    } catch (err) {
      console.error('❌ Error saat download:', err)
      return null
    }
  }

  stop(): void {
    this.player.stop()
    this.lastFilePath = null
    this.looping = false
    this.cleanup()
    // this.disconnect()
  }

  pause(): void {
    if (this.isPlaying) {
      this.player.pause()
    }
  }

  unpause(): void {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause()
    }
  }

  setVolume(volume: number): void {
    if (this.currentResource && this.currentResource.volume) {
      // Clamp volume between 0 and 1
      const clampedVolume = Math.max(0, Math.min(1, volume))
      this.currentResource.volume.setVolume(clampedVolume)
    }
  }

  getStatus(): { isPlaying: boolean, isConnected: boolean } {
    return {
      isPlaying: this.isPlaying,
      isConnected: this.connection?.state.status === VoiceConnectionStatus.Ready
    }
  }

  public cleanup(): void {
    if (this.currentResource) {
      this.currentResource = null
    }
  }

  disconnect(): void {
    this.stop()
    if (this.connection) {
      this.connection.destroy()
      this.connection = null
    }
  }
}