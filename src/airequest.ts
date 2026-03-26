import { CAINode } from "cainode"
import { Memory, type MessageMemory } from "./memory.js"
import fs from "fs/promises"
import path from "path"

interface GeminiResponse {
  candidates?: [{
    content: {
      parts: [{
        text: string
      }]
    }
  }]
  error?: {
    message: string
  }
}

interface CharacterAiResponse {
  turn?: {
    turn_key: {
      chat_id: string
      turn_id: string
    },
    create_time: Date,
    last_update_time: Date,
    state: string,
    author: {
      author_id: string
      name: string
    },
    candidates: [{
      candidate_id: string
      create_time: Date,
      raw_content: string
      is_final: boolean,
      model_type: string
    }],
    primary_candidate_id: string
  },
  chat_info: {
    type: string
  },
  generation_mode: {
    mode: string
    remaining_quota_frac: number
  },
  command: string
  request_id: string
}

export class AIService {
  private apiKey: string
  private baseUrl: string
  private characterAI: any
  private charToken: string
  private charId: string
  private memory: Memory
  private persona: string = ""

  constructor(apiKey: string = process.env["GOOGLE_API_KEY"] || '') {
    this.apiKey = apiKey
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'
    this.charToken = process.env["CHAR_TOKEN"] || ""
    this.charId = process.env["CHAR_ID"] || ""

    this.characterAI = new CAINode()
    this.memory = new Memory()

    // Load persona asynchronously
    this.loadPersona().catch(err => console.error("❌ Failed to load persona:", err))
  }

  private async loadPersona() {
    try {
      const personaPath = path.join(process.cwd(), "src", "agent", "SOUL.md")
      this.persona = await fs.readFile(personaPath, "utf-8")
      console.log("📜 Persona loaded successfully.")
    } catch (error) {
      console.warn("⚠️ Could not load persona from src/agent/SOUL.md, using default.")
      this.persona = "You are a helpful Discord bot. Answer in Bahasa Indonesia."
    }
  }

  async login() {
    if (this.charToken && this.charId) {
      const reslogin = await this.characterAI.login(this.charToken)
      console.log("Login: ", reslogin)
      const resConnect = await this.characterAI.character.connect(this.charId)
      console.log("Connect: ", resConnect)
    }
    await this.memory.init()
  }

  // Check if AI server is healthy
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl + 'health')
      return response.ok
    } catch (error) {
      console.error('❌ AI Health check failed:', error)
      return false
    }
  }

  // Send request to Gemini
  async sendRequest(prompt: string, userId?: string, file?: { url: string, contentType: string, filename: string }): Promise<{ success: boolean, response?: string, error?: string }> {
    try {
      console.log(`🤖 Sending Gemini request: "${prompt.substring(0, 50)}..."`)

      // 1. Get relevant memories
      const memories = await this.memory.getRelevantMemories(prompt)

      // 2. Format context with persona and memories
      const formattedPrompt = this.formatPrompt(prompt, memories, userId)

      const parts: any[] = [{ text: formattedPrompt }]

      // Handle file attachment
      if (file) {
        console.log(`📎 Processing file: ${file.filename} (${file.contentType})`)
        const fileResponse = await fetch(file.url)
        if (!fileResponse.ok) throw new Error(`Failed to download file: ${fileResponse.statusText}`)

        const fileBuffer = await fileResponse.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        let mimeType = file.contentType
        if (!mimeType && file.filename) {
          const ext = file.filename.split('.').pop()?.toLowerCase()
          const mimeMap: Record<string, string> = {
            'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp'
          }
          mimeType = mimeMap[ext || ''] || 'application/octet-stream'
        }

        parts.push({ inline_data: { mime_type: mimeType, data: base64Data } })
      }

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        throw new Error(`HTTP ${response.status}: ${errorData?.error?.message || response.statusText}`)
      }

      const data = await response.json() as GeminiResponse
      if (data.error) return { success: false, error: data.error.message }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!content) return { success: false, error: 'AI tidak memberikan respon' }

      // 3. Save interaction to memory
      await this.memory.addMemory("user", prompt)
      await this.memory.addMemory("assistant", content)

      console.log(`✅ Gemini response generated successfully`)
      return { success: true, response: content.trim() }

    } catch (error) {
      console.error('❌ Gemini request error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Terjadi error pada AI' }
    }
  }

  // Format prompt with Persona and Memories
  formatPrompt(userMessage: string, memories: MessageMemory[], userId?: string): string {
    let context = `${this.persona}\n\n`

    if (memories.length > 0) {
      context += "### Relevant Past Conversations:\n"
      memories.reverse().forEach(m => {
        context += `${m.role === "user" ? "User" : "Plana"}: ${m.content}\n`
      })
      context += "\n"
    }

    context += `### Current Interaction:\nUser (ID: ${userId || 'unknown'}): ${userMessage}\nPlana:`
    return context
  }

  formatAIResponse(response: string, discordUserTag: string): string {
    return response
      .trim()
      .replace(/\bIlmeee[-\s]?Sensei\b/gi, `<@${discordUserTag}>`)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ ]+$/gm, '')
      .replace(/\n\n\n/g, '\n\n')
      .replace(/```\n\n+/g, '```\n')
      .replace(/\n\n+```/g, '\n```')
  }


  splitLongMessage(content: string): string[] {
    const maxLength = 1900 // Sisakan ruang untuk formatting
    const chunks: string[] = []

    if (content.length <= maxLength) {
      return [content]
    }

    // Split berdasarkan paragraf atau newlines
    const paragraphs = content.split('\n\n')
    let currentChunk = ''

    for (const paragraph of paragraphs) {
      // Jika paragraph sendiri terlalu panjang, split lagi
      if (paragraph.length > maxLength) {
        // Simpan chunk saat ini jika ada
        if (currentChunk) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }

        // Split paragraph panjang berdasarkan kalimat
        const sentences = paragraph.split('. ')
        for (const sentence of sentences) {
          const sentenceWithPeriod = sentence + (sentence.endsWith('.') ? '' : '.')

          if (currentChunk.length + sentenceWithPeriod.length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim())
              currentChunk = sentenceWithPeriod
            } else {
              // Jika kalimat tunggal terlalu panjang, potong paksa
              chunks.push(sentenceWithPeriod.substring(0, maxLength - 3) + '...')
            }
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentenceWithPeriod
          }
        }
      } else {
        // Cek apakah menambah paragraph ini akan melebihi limit
        if (currentChunk.length + paragraph.length + 2 > maxLength) {
          if (currentChunk) {
            chunks.push(currentChunk.trim())
            currentChunk = paragraph
          }
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph
        }
      }
    }

    // Tambahkan chunk terakhir
    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    // Pastikan tidak ada chunk kosong
    return chunks.filter(chunk => chunk.trim().length > 0)
  }

  async sendRequestPlana(prompt: string): Promise<{ success: boolean, response?: string, error?: string }> {
    try {
      if (!this.charToken || !this.charId) {
        throw new Error("CHARACTER_TOKEN atau CHARACTER_ID belum diatur di environment variable")
      }

      const response = await this.characterAI.character.send_message(prompt, false) as CharacterAiResponse

      if (!response?.turn?.candidates?.[0]?.raw_content) {
        throw new Error("Character.AI tidak mengembalikan respon")
      }

      console.log(`✅ Character.AI response: "${response.turn.candidates[0].raw_content.substring(0, 100)}..."`)
      return { success: true, response: response.turn.candidates[0].raw_content }
    } catch (error) {
      console.error('❌ Character.AI request error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Terjadi error pada Character.AI'
      }
    }
  }
}
