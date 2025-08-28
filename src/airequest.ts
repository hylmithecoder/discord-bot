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


export class AIService {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:8080/') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
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
      // Check health first
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        return {
          success: false,
          error: 'AI server tidak tersedia'
        };
      }

      console.log(`🤖 Sending AI request: "${prompt.substring(0, 50)}..."`);

      const response = await fetch(this.baseUrl + 'completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          n_predict: 512,
          temperature: 0.7,
          top_p: 0.9,
          model: 'gemma-3',
          stream: false,
          stop: ['\n\n', 'Human:', 'Assistant:', '<|im_end|>'],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: LlamaResponse = await response.json();
      
      if (!data.content) {
        return {
          success: false,
          error: 'AI tidak memberikan respon'
        };
      }

      console.log(`✅ AI response generated (${data.tokens_predicted} tokens)`);
      return {
        success: true,
        response: data.content.trim()
      };

    } catch (error) {
      console.error('❌ AI request error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Terjadi error pada AI'
      };
    }
  }

  // Format prompt untuk Gemma model
  formatPrompt(userMessage: string, context?: string): string {
    const systemPrompt = context || "You are a helpful Discord bot assistant. Answer concisely and friendly in Bahasa Indonesia.";
    
    return `<bos><start_of_turn>user
${systemPrompt}

User: ${userMessage}
<end_of_turn>
<start_of_turn>model
`;
  }
}
