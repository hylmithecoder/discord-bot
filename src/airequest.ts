// === LLAMA.CPP AI SERVICE ===
interface LlamaResponse {
  content: string;
  generation_settings: any;
  model: string;
  prompt: string;
  stopped_eos: boolean;
  stopped_limit: boolean;
  stopped_word: boolean;
  stopping_word: string;
  timings: any;
  tokens_cached: number;
  tokens_evaluated: number;
  tokens_predicted: number;
  truncated: boolean;
}

interface GeminiResponse {
  candidates?: [{
    content: {
      parts: [{
        text: string;
      }];
    };
  }];
  error?: {
    message: string;
  };
}

export class AIService {
  private apiKey: string;
  private baseUrl: string;
  
  constructor(apiKey: string = process.env["GOOGLE_API_KEY"] || '') {
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  // Check if AI server is healthy
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl + 'health');
      return response.ok;
    } catch (error) {
      console.error('❌ AI Health check failed:', error);
      return false;
    }
  }

  // Send request to llama.cpp
  async sendRequest(prompt: string): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      console.log(`🤖 Sending Gemini request: "${prompt.substring(0, 50)}..."`);
      console.log(this.baseUrl);
      console.log(this.apiKey);
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt.trim()
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as GeminiResponse;
      
      if (data.error) {
        return {
          success: false,
          error: data.error.message
        };
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        return {
          success: false,
          error: 'AI tidak memberikan respon'
        };
      }

      console.log(`✅ Gemini response generated successfully`);
      return {
        success: true,
        response: content.trim()
      };

    } catch (error) {
      console.error('❌ Gemini request error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Terjadi error pada AI'
      };
    }
  }

  // Format prompt untuk Gemma model
  formatPrompt(userMessage: string, context?: string): string {
    const systemPrompt = context || "You are a helpful Discord bot assistant. Answer concisely and friendly in Bahasa Indonesia.";
    return `${systemPrompt}\n\nUser: ${userMessage}`;
  }

  formatAIResponse(response: string): string {
    return response
      .trim()
      // Hapus ** (single bold markers)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // Ubah *** menjadi ** (triple to double asterisk untuk bold)
      .replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**')
      // Bersihkan multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Bersihkan trailing spaces
      .replace(/[ ]+$/gm, '')
      // Fix spacing around code blocks
      .replace(/```\n\n+/g, '```\n')
      .replace(/\n\n+```/g, '\n```');
  }

  splitLongMessage(content: string): string[] {
    const maxLength = 1900; // Sisakan ruang untuk formatting
    const chunks: string[] = [];
    
    if (content.length <= maxLength) {
      return [content];
    }

    // Split berdasarkan paragraf atau newlines
    const paragraphs = content.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // Jika paragraph sendiri terlalu panjang, split lagi
      if (paragraph.length > maxLength) {
        // Simpan chunk saat ini jika ada
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Split paragraph panjang berdasarkan kalimat
        const sentences = paragraph.split('. ');
        for (const sentence of sentences) {
          const sentenceWithPeriod = sentence + (sentence.endsWith('.') ? '' : '.');
          
          if (currentChunk.length + sentenceWithPeriod.length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = sentenceWithPeriod;
            } else {
              // Jika kalimat tunggal terlalu panjang, potong paksa
              chunks.push(sentenceWithPeriod.substring(0, maxLength - 3) + '...');
            }
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentenceWithPeriod;
          }
        }
      } else {
        // Cek apakah menambah paragraph ini akan melebihi limit
        if (currentChunk.length + paragraph.length + 2 > maxLength) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
          }
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
      }
    }

    // Tambahkan chunk terakhir
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    // Pastikan tidak ada chunk kosong
    return chunks.filter(chunk => chunk.trim().length > 0);
  }

}
