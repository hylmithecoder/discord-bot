import express from "express";
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { AIService } from "./airequest.js";
import { SpotifyService, YoutubeMusicPlayer } from "./musichandler.js";
import { exportClient } from "./main.js";
import { VoiceChannel, GuildMember } from 'discord.js';

interface SlashCommand {
  name: string;
  description: string;
  options?: SlashSubCommandGroup[];
  handler: (req: any, res: any) => void;
}

interface SlashSubCommandGroup {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  options?: SlashSubcommand[];
  // handler: (req: any, res: any) => void;
}

interface SlashSubcommand {
  name: string;
  description: string;
  type: number;
  required: boolean;
  options?: SlashSubcommandOption[];
  // handler: (req: any, res: any) => void;
}

interface SlashSubcommandOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
  // handler: (req: any, res: any) => void;
}

const aiService = new AIService(process.env.LLAMA_CPP_URL);

const slashCommands: SlashCommand[] = [
  {
    name: 'test',
    description: 'Test command untuk cek bot',
    handler: (req, res) => {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '👋 This bot uses TypeScript programming language!',
        },
      });
    }
  },
  {
    name: 'sapa',
    description: 'Menyapa user yang menggunakan command',
    handler: (req, res) => {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `👋 Halo <@${userId}>! Selamat datang!`,
        },
      });
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
    handler: async (req: any, res: any) => {
      try {
        const music = new YoutubeMusicPlayer();
        const input = req.body.data.options?.[0].value;

        if (!input) {
          return res.send({
            type: 4,
            data: { content: "❌ Silakan masukkan nama musik atau URL!" },
          });
        }

        const guild = exportClient().guilds.cache.get(req.body.guild_id);
        const member = guild?.members.cache.get(req.body.member.user.id);
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
          return res.send({
            type: 4,
            data: { content: "❌ Kamu harus join voice channel dulu!" },
          });
        }

        // Send deferred response
        await res.send({
          type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
          data: { content: "🔍 Mencari dan memuat musik..." },
        });

        // Join voice channel
        const joined = await music.join(voiceChannel as VoiceChannel);
        if (!joined) {
          return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: "❌ Gagal join voice channel! Coba lagi nanti."
            })
          });
        }

        // Play music
        const result = await music.play(input);
        
        return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: result.success 
              ? `🎶 Sekarang memutar: **${result.title}**`
              : `❌ ${result.error}`
          })
        });

      } catch (error) {
        console.error('❌ Play command error:', error);
        return fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: "❌ Terjadi kesalahan saat memutar musik."
          })
        });
      }
    },
  },
  {
    name: 'carimusic',
    description: 'Cari nama musik dari Spotify',
    handler: async (req, res) => {
      const spotifyService = new SpotifyService();
      const query = req.body.data.options?.[0]?.value;

      if (!query) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Harap masukkan judul musik!' },
        });
      }

      try {
        // Kirim deferred response dulu
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        // Log query dengan length limit
        console.log(`🔍 Searching for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
        
        const result = await spotifyService.getTrackInfo(query);
        
        if (!result?.data?.title || !result?.data?.url) {
          throw new Error('Invalid track data received');
        }

        const { title, url, artist, duration } = result.data;
        
        // Format pesan dengan informasi lebih detail
        const response = [
          `✅ **${title}**`,
          artist ? `👤 ${artist}` : '',
          duration ? `⏱️ ${duration}` : '',
          `🔗 ${url}`
        ].filter(Boolean).join('\n');

        // Update deferred message
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: response
          })
        });

      } catch (err) {
        console.error("❌ Music search error:", err instanceof Error ? err.message : 'Unknown error');
        
        const errorMessage = err instanceof Error && err.message.includes('Invalid track') 
          ? '❌ Data lagu tidak valid atau tidak lengkap.'
          : '❌ Gagal mencari musik. Silakan coba lagi nanti.';

        // Update deferred message with error
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: errorMessage
          })
        });
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
    description: 'Menghentikan musik (coming soon)',
    handler: (req, res) => {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '⏹️ Fitur stop musik akan segera hadir!',
        },
      });
    }
  },
  {
    name: 'ping',
    description: 'Cek latency bot',
    handler: (req, res) => {
      const timestamp = Date.now();
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🏓 Pong! Latency: ${timestamp % 1000}ms`,
        },
      });
    }
  },
  {
    name: 'help',
    description: 'Menampilkan list command',
    handler: (req, res) => {
      const commandList = slashCommands.map(cmd => `• \`/${cmd.name}\` - ${cmd.description}`).join('\n');
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `📋 **Daftar Command:**\n${commandList}`,
        },
      });
    }
  },
  {
    name: 'ask',
    description: 'Chat dengan AI Gemma 3 model',
    handler: async (req, res) => {
      const message = req.body.data.options?.[0].value;
      const userId = req.body.member?.user?.id || req.body.user?.id;

      if (!message?.trim()) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Pesan tidak boleh kosong!' }
        });
      }

      // Send deferred response
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      });

      try {
        console.log(`📝 AI Request from ${userId}: "${message.substring(0, 300)}..."`);
        
        // Format prompt dan kirim ke AI
        const formattedPrompt = aiService.formatPrompt(message);
        const aiResult = await aiService.sendRequest(formattedPrompt);

        if (!aiResult.success || !aiResult.response) {
          throw new Error(aiResult.error || 'Tidak ada respon dari AI');
        }

        // Format response dengan line breaks yang lebih baik
        const formattedResponse = aiResult.response
          .trim()
          .replace(/\n{3,}/g, '\n\n'); // Replace multiple newlines with double newline

        // Truncate jika terlalu panjang
        const finalResponse = formattedResponse.length > 1900 
          ? formattedResponse.substring(0, 1900) + '...'
          : formattedResponse;

        // Update deferred message
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: [
              `**<@${userId}>:**`,
              '```',
              finalResponse,
              '```'
            ].join('\n')
          })
        });

      } catch (error) {
        console.error('❌ AI command error:', error instanceof Error ? error.message : 'Unknown error');
        
        // Update deferred message with error
        return await fetch(`https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `❌ **Error:** ${error instanceof Error ? error.message : 'Terjadi kesalahan saat berkomunikasi dengan AI'}`
          })
        });
      }
    },
    options: [
      {
        name: "message",
        description: "Pesan yang ingin ditanyakan ke AI",
        type: 3,
        required: true
      }
    ]
  }
];

export function handleRouter(){
    const app = express();
    const PORT = process.env.PORT || 3000;
    // Router Interactions
    app.post(
    '/interactions',
    verifyKeyMiddleware(process.env.PUBLIC_KEY!),
    async function (req, res) {
        const { type, data } = req.body;

        // Handle PING
        if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
        }

        // Handle APPLICATION_COMMAND
        if (type === InteractionType.APPLICATION_COMMAND) {
        const { name } = data;
        
        // Cari command handler
        const command = slashCommands.find(cmd => cmd.name === name);
        
        if (command) {
            try {
            return command.handler(req, res);
            } catch (error) {
            console.error(`❌ Error executing command ${name}:`, error);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                content: '❌ Terjadi error saat menjalankan command!',
                },
            });
            }
        }
        
        // Command tidak ditemukan
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
            content: `❌ Command \`${name}\` tidak dikenal!`,
            },
        });
        }

        return res.status(400).json({ error: 'Unknown interaction type' });
    },
    );

    app.get("/callback", (req, res) => {
        res.status(200).json({
            status: "success",
            data: "callback ready"
        });
    });

    // === EXPRESS SERVER ===
    app.listen(PORT, () => {
        console.log(`🌐 Express server listening on port ${PORT}`);
        console.log(`📝 Total ${slashCommands.length} slash commands terdaftar`);
        console.log(`🤖 AI Service URL: ${aiService['baseUrl']}`);
        
        // Check AI health on startup
        aiService.checkHealth().then(healthy => {
        console.log(`🤖 AI Service: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        });
    });
}


// === HELPER FUNCTION TO ADD NEW COMMAND ===
export function addSlashCommand(command: SlashCommand) {
  slashCommands.push(command);
  console.log(`Command /${command.name} ditambahkan ke daftar`);
}

export default function slashCommandsExport(){
  return slashCommands;
}
