import express from "express"
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions'
import { AIService } from "./airequest.js"
import { exec } from "child_process"
import { SpotifyService, YoutubeMusicPlayer } from "./musichandler.js"
import { exportClient } from "./main.js"
import { VoiceChannel, GuildMember, TextChannel } from 'discord.js'
import cors from "cors"
import fs from "fs"
import { promisify } from "util"

const music = new YoutubeMusicPlayer()
const execAsync = promisify(exec)
// Cache untuk menghindari request berulang ke URL yang sama
const cache = new Map<string, { stream: string, timestamp: number }>()
const CACHE_TTL = 300000 // 5 menit aja (link YouTube cepet expire)

interface SlashCommand {
  name: string
  description: string
  options?: SlashSubCommandGroup[]
  handler: (req: any, res: any) => void
}

interface SlashSubCommandGroup {
  name: string
  description: string
  type: number
  required?: boolean
  options?: SlashSubcommand[]
  // handler: (req: any, res: any) => void
}

interface SlashSubcommand {
  name: string
  description: string
  type: number
  required: boolean
  options?: SlashSubcommandOption[]
  // handler: (req: any, res: any) => void
}

interface SlashSubcommandOption {
  name: string
  description: string
  type: number
  required: boolean
  // handler: (req: any, res: any) => void
}

const aiService = new AIService(process.env["GOOGLE_API_KEY"] || "")
// Login ke character.ai
aiService.login()

const slashCommands: SlashCommand[] = [
  {
    name: 'test',
    description: 'Test command untuk cek bot',
    handler: (_req, res) => {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '👋 This bot uses TypeScript programming language!',
        },
      })
    }
  },
  {
    name: 'sapa',
    description: 'Menyapa user yang menggunakan command',
    handler: (req, res) => {
      const userId = req.body.member?.user?.id || req.body.user?.id
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `👋 Halo <@${userId}>! Selamat datang!`,
        },
      })
    }
  },
  {
    name: "play",
    description: "Play music from YouTube",
    options: [
      {
        name: "music",
        description: "Nama musik atau URL YouTube yang ingin diputar",
        type: 3,
        required: true
      }
    ],
    // Di dalam handler play command
    handler: async (req, res) => {
      try {
        console.log(req.body.data.options?.[0].value)
        const input = req.body.data.options?.[0].value

        if (!input) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "❌ Silakan masukkan nama musik atau URL!" },
          })
        }

        const guild = exportClient().guilds.cache.get(req.body.guild_id)
        // console.log(req.body)
        const member = guild?.members.cache.get(req.body?.member.user?.id)
        // console.log(member)
        const voiceChannel = member?.voice?.channel
        console.log(voiceChannel)
        if (!voiceChannel) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "❌ Kamu harus join voice channel dulu!" },
          })
        }

        // Send deferred response
        await res.send({
          type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
          data: { content: "🔍 Mencari dan memuat musik..." },
        })

        // Join voice channel
        const joined = await music.join(voiceChannel as VoiceChannel)
        console.log(joined)
        if (!joined) {
          return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: "❌ Gagal join voice channel! Coba lagi nanti."
            })
          })
        }

        // Play music
        const result = await music.play(input)

        return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: result.success
              ? `🎶 Sekarang memutar: **${result.title}**`
              : `❌ ${result.error}`
          })
        })

      } catch (error) {
        console.error('❌ Play command error:', error)
        return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: "❌ Terjadi kesalahan saat memutar musik."
          })
        })
      }
    },
  },
  {
    name: 'carimusic',
    description: 'Cari nama musik dari Spotify',
    handler: async (req, res) => {
      const spotifyService = new SpotifyService()
      const query = req.body.data.options?.[0]?.value

      if (!query) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Harap masukkan judul musik!' },
        })
      }

      try {
        // Kirim deferred response dulu
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        })

        // Log query dengan length limit
        console.log(`🔍 Searching for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`)

        const result = await spotifyService.getTrackInfo(query)

        if (!result?.data?.title || !result?.data?.url) {
          throw new Error('Invalid track data received')
        }

        const { title, url, artist, duration } = result.data

        // Format pesan dengan informasi lebih detail
        const response = [
          `✅ **${title}**`,
          artist ? `👤 ${artist}` : '',
          duration ? `⏱️ ${duration}` : '',
          `🔗 ${url}`
        ].filter(Boolean).join('\n')

        // Update deferred message
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: response
          })
        })

      } catch (err) {
        console.error("❌ Music search error:", err instanceof Error ? err.message : 'Unknown error')

        const errorMessage = err instanceof Error && err.message.includes('Invalid track')
          ? '❌ Data lagu tidak valid atau tidak lengkap.'
          : '❌ Gagal mencari musik. Silakan coba lagi nanti.'

        // Update deferred message with error
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: errorMessage
          })
        })
      }
    },
    options: [
      {
        name: "music",
        description: "Judul musik yang ingin diputar",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'stop',
    description: 'Menghentikan musik dan keluar dari voice channel',
    handler: async (req, res) => {
      try {
        music.disconnect()

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `⏹️ Musik dihentikan dan bot keluar dari voice channel.\nStop by @${req.body.member?.user?.username || 'unknown'}`,
          },
        })
      } catch (error) {
        console.error("❌ Error saat stop:", error)
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Gagal menghentikan musik. Coba lagi nanti.',
          },
        })
      }
    }
  }, {
    name: 'loopmusic',
    description: 'Melakukan loop musik terakhir yang diputar',
    handler: async (req, res) => {
      try {
        if (!music.lastTrack) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '⚠️ Tidak ada musik terakhir yang bisa di-loop!',
            },
          })
        }

        // Toggle loop state
        music.looping = !music.looping

        if (music.looping) {
          // Aktifkan mode loop
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🔁 Mode loop aktif!\n🎵 Sedang diulang: **${music.lastTrack.title}**\nLoop by @${req.body.member?.user?.username || 'unknown'}`,
            },
          })
        } else {
          // Nonaktifkan mode loop
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⏹️ Mode loop dimatikan oleh @${req.body.member?.user?.username || 'unknown'}`,
            },
          })
        }
      } catch (err) {
        console.error('❌ Error in /loopmusic:', err)
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Gagal mengatur mode loop!' },
        })
      }
    }
  },
  {
    name: 'ping',
    description: 'Cek latency bot',
    handler: (_req, res) => {
      const timestamp = Date.now()
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🏓 Pong! Latency: ${timestamp % 1000}ms`,
        },
      })
    }
  },
  {
    name: 'help',
    description: 'Menampilkan list command',
    handler: (_req, res) => {
      const commandList = slashCommands.map(cmd => `• \`/${cmd.name}\` - ${cmd.description}`).join('\n')
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `📋 **Daftar Command:**\n${commandList}`,
        },
      })
    }
  },
  {
    name: 'ask',
    description: 'Chat with Gemini Flash 2.5 model',
    options: [
      {
        name: "message",
        description: "Pesan yang ingin ditanyakan",
        type: 3, // STRING
        required: true
      },
      {
        name: "file",
        description: "File yang ingin diupload (PDF/Gambar)",
        type: 11, // ATTACHMENT
        required: false
      }
    ],
    handler: async (req, res) => {
      const message = req.body.data.options?.find((opt: any) => opt.name === 'message')?.value
      const fileOption = req.body.data.options?.find((opt: any) => opt.name === 'file')
      const userId = req.body.member?.user?.id || req.body.user?.id

      if (!message?.trim()) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Pesan tidak boleh kosong!' }
        })
      }

      // Send deferred response
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      })

      try {
        console.log(`📝 AI Request from ${userId}: "${message.substring(0, 300)}..."`)

        // Process file attachment if exists
        let fileData = undefined
        if (fileOption) {
          const attachment = req.body.data.resolved?.attachments?.[fileOption.value]
          if (attachment) {
            fileData = {
              url: attachment.url,
              contentType: attachment.content_type,
              filename: attachment.filename
            }
            console.log(`📎 File attached: ${fileData.filename}`)
          }
        }

        // Send to AI with optional file
        const aiResult = await aiService.sendRequest(message, userId, fileData)
        console.log(aiResult)

        if (!aiResult.success || !aiResult.response) {
          throw new Error(aiResult.error || 'Tidak ada respon dari AI')
        }

        // Format response
        const formattedResponse = aiService.formatAIResponse(aiResult.response, userId)
        const responseChunks = aiService.splitLongMessage(formattedResponse)

        // Update deferred message
        await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: responseChunks[0]
          })
        })

        // Send additional chunks
        for (let i = 1; i < responseChunks.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000))

          await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: responseChunks[i]
            })
          })
        }

        return

      } catch (error) {
        console.error('❌ AI command error:', error instanceof Error ? error.message : 'Unknown error')

        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `❌ Terjadi kesalahan: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
        })
      }
    }
  }, {
    name: 'plana',
    description: 'Chat with plana model from C.AI',
    options: [
      {
        name: "message",
        description: "Pesan yang ingin ditanyakan",
        type: 3,
        required: true
      }
    ],
    handler: async (req, res) => {
      const message = req.body.data.options?.[0].value
      const userId = req.body.member?.user?.id || req.body.user?.id

      if (!message?.trim()) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Pesan tidak boleh kosong!' }
        })
      }

      // Send deferred response
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      })

      try {
        console.log(`📝 AI Request from ${userId}: "${message.substring(0, 300)}..."`)

        // Format prompt dan kirim ke AI
        // const formattedPrompt = aiService.formatPrompt(message)
        const aiResult = await aiService.sendRequestPlana(message)
        console.log(aiResult)
        if (aiResult.success) {
          await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: aiResult.response
            })
          })
        } else {
          await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `❌ Gagal berkomunikasi dengan Plana: ${aiResult.error}`
            })
          })
        }
      } catch (error) {
        console.error('❌ AI command error:', error instanceof Error ? error.message : 'Unknown error')

        // Update deferred message with error
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `❌ Terjadi kesalahan saat berkomunikasi dengan AI: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
        })
      }
    }
  }
]

export function handleRouter() {
  const app = express()

  // Router Interactions
  app.use(cors())

  app.use(express.json())

  app.post(
    '/interactions',
    verifyKeyMiddleware(process.env["PUBLIC_KEY"]!),
    async function (req, res) {
      const { type, data } = req.body

      // Handle PING
      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG })
      }

      // Handle APPLICATION_COMMAND
      if (type === InteractionType.APPLICATION_COMMAND) {
        const { name } = data

        // Cari command handler
        const command = slashCommands.find(cmd => cmd.name === name)

        if (command) {
          try {
            return command.handler(req, res)
          } catch (error) {
            console.error(`❌ Error executing command ${name}:`, error)
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Terjadi error saat menjalankan command!',
              },
            })
          }
        }

        // Command tidak ditemukan
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Command \`${name}\` tidak dikenal!`,
          },
        })
      }

      return res.status(400).json({ error: 'Unknown interaction type' })
    },
  )

  app.get("/callback", (_req, res) => {
    res.status(200).json({
      status: "success",
      data: "callback ready"
    })
  })

  // Endpoint ambil stream URL YouTube
  app.get("/youtube", (req, res) => {
    const url = req.query["url"] as string
    if (!url) return res.status(400).send("⚠️ query ?url=... wajib ada")

    exec(`yt-dlp -f bestaudio/best -g --user-agent "Mozilla/5.0" "${url}"`, (err, stdout, stderr) => {
      if (err) {
        console.error("yt-dlp error:", stderr)
        return res.status(500).send(stderr || err.message)
      }
      res.json({ stream: stdout.trim() })
    })
  })

  app.post("/api/send-message", async (req, res) => {
    try {
      const { channelId, content } = req.body

      const channel = await exportClient().channels.fetch(channelId)
      if (!channel?.isTextBased()) {
        return res.status(400).json({ error: "Channel tidak valid" })
      }

      await (channel as TextChannel).send(content)
      return res.status(200).json({ success: true })
    } catch (err) {
      console.error("❌ Gagal kirim pesan:", err)
      res.status(500).json({ error: "Gagal mengirim pesan" })
    }
  })

  app.get("/", (_req, res) => {
    res.send("Discord Bot is running!")
  })

  return app
}

// Fungsi untuk proxy stream dari Google ke client
async function proxyStream(streamUrl: string, res: any, req: any) {
  try {
    // Headers yang dibutuhin Google Video server
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0 Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,enq=0.9",
      "Origin": "https://www.youtube.com",
      "Referer": "https://www.youtube.com/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
    } as any

    // Support Range request untuk seeking
    if (req.headers.range) {
      headers["Range"] = req.headers.range
    }

    const response = await fetch(streamUrl, { headers }) as any

    if (!response.ok) {
      console.error("❌ Google returned:", response.status)
      return res.status(response.status).json({
        error: "Stream unavailable",
        status: response.status,
      })
    }

    // Forward response headers
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/webm")

    const contentLength = response.headers.get("content-length")
    if (contentLength) {
      res.setHeader("Content-Length", contentLength)
    }

    const contentRange = response.headers.get("content-range")
    if (contentRange) {
      res.setHeader("Content-Range", contentRange)
      res.status(206) // Partial content
    }

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Accept-Ranges", "bytes")

    // Pipe stream ke client
    response.body.pipe(res)

  } catch (error: any) {
    console.error("Proxy error:", error.message)
    if (!res.headersSent) {
      res.status(500).json({ error: "Proxy failed: " + error.message })
    }
  }
}

// Bersihkan cache tiap 10 menit
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key)
    }
  }
  console.log(`🧹 Cache cleaned. Current size: ${cache.size}`)
}, 600000)

// === HELPER FUNCTION TO ADD NEW COMMAND ===
export function addSlashCommand(command: SlashCommand) {
  slashCommands.push(command)
  console.log(`Command /${command.name} ditambahkan ke daftar`)
}

export default function slashCommandsExport() {
  return slashCommands
}
