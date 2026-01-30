import { CAINode } from "cainode"

// === LLAMA.CPP AI SERVICE ===
interface LlamaResponse {
  content: string
  generation_settings: any
  model: string
  prompt: string
  stopped_eos: boolean
  stopped_limit: boolean
  stopped_word: boolean
  stopping_word: string
  timings: any
  tokens_cached: number
  tokens_evaluated: number
  tokens_predicted: number
  truncated: boolean
}

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

  constructor(apiKey: string = process.env["GOOGLE_API_KEY"] || '') {
    this.apiKey = apiKey
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'
    this.charToken = process.env["CHAR_TOKEN"] || ""
    this.charId = process.env["CHAR_ID"] || "" // contoh: "5a1d2b3c4d..."

    // Init character
    this.characterAI = new CAINode()
  }

  async login(){
    const reslogin = await this.characterAI.login(this.charToken) 
    console.log("Login: ", reslogin)
    const resConnect = await this.characterAI.character.connect(this.charId)
    console.log("Connect: ", resConnect)
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

  // Send request to llama.cpp
  async sendRequest(prompt: string, file?: { url: string, contentType: string, filename: string }): Promise<{ success: boolean, response?: string, error?: string }> {
    try {
      console.log(`🤖 Sending Gemini request: "${prompt.substring(0, 50)}..."`)
      
      const parts: any[] = [{ text: prompt.trim() }]

      // Handle file attachment
      if (file) {
        console.log(`📎 Processing file: ${file.filename} (${file.contentType})`)
        
        // Download file dari Discord CDN
        const fileResponse = await fetch(file.url)
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.statusText}`)
        }

        const fileBuffer = await fileResponse.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        // Determine MIME type
        let mimeType = file.contentType
        if (!mimeType && file.filename) {
          // Fallback mime type detection
          const ext = file.filename.split('.').pop()?.toLowerCase()
          const mimeMap: Record<string, string> = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp'
          }
          mimeType = mimeMap[ext || ''] || 'application/octet-stream'
        }

        // Add inline data to parts
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        })

        console.log(`✅ File converted to base64 (${mimeType})`)
      }

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }]
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        throw new Error(`HTTP ${response.status}: ${errorData?.error?.message || response.statusText}`)
      }

      const data = await response.json() as GeminiResponse

      if (data.error) {
        return {
          success: false,
          error: data.error.message
        }
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!content) {
        return {
          success: false,
          error: 'AI tidak memberikan respon'
        }
      }

      console.log(`✅ Gemini response generated successfully`)
      return {
        success: true,
        response: content.trim()
      }

    } catch (error) {
      console.error('❌ Gemini request error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Terjadi error pada AI'
      }
    }
  }

  // Format prompt untuk Gemma model
  formatPrompt(userMessage: string, context?: string): string {
    const systemPrompt = context || "You are a helpful Discord bot assistant. Answer concisely and friendly in Bahasa Indonesia."
    return `${systemPrompt}\n\nUser: ${userMessage}`
  }

  formatAIResponse(response: string, discordUserTag: string): string {
  return response
    .trim()
    // Replace Ilmeee-Sensei dengan tag user Discord
    .replace(/\bIlmeee[-\s]?Sensei\b/gi, `<@${discordUserTag}>`)
    // Hapus ** (single bold markers)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Ubah *** menjadi ** (triple to double asterisk untuk bold)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**')
    // Bersihkan multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Bersihkan trailing spaces
    .replace(/[ ]+$/gm, '')
    .replace(/\n\n\n/g, '\n\n')
    // Fix spacing around code blocks
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
