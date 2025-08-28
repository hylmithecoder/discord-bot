import express from "express";
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { AIService } from "./airequest.js";

interface SlashCommand {
  name: string;
  description: string;
  options?: any[];
  handler: (req: any, res: any) => void;
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
    name: 'play',
    description: 'Memutar musik dari YouTube',
    handler: async (req, res) => {
      const query = req.body.data.options?.[0]?.value;

      if (!query) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Harap masukkan judul musik!' },
        });
      }

      // Balas dulu biar user tau sedang cari
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `🔎 Sedang mencari musik: **${query}** ...` },
      });

      try {
        // panggil yt-dlp buat cari musik
        const { exec } = await import("child_process");
        const util = await import("util");
        const execPromise = util.promisify(exec);

        const { stdout } = await execPromise(
          `yt-dlp "ytsearch1:${query}" --print "%(title)s|%(webpage_url)s"`
        );

        const [title, url] = stdout.trim().split("|");

        // balas hasil pencarian
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ Ditemukan: **${title}**\n${url}`,
          },
        });
      } catch (err) {
        console.error("yt-dlp error:", err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Gagal mencari musik.' },
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
    description: 'Menampilkan bantuan',
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
    name: 'ai',
    description: 'Chat dengan AI menggunakan model Gemma 3',
    handler: async (req, res) => {
      const message = req.body.data.options?.[0]?.value;
      const userId = req.body.member?.user?.id || req.body.user?.id;

      if (!message) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Harap masukkan pesan untuk AI!' },
        });
      }

      // Response awal
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { 
          content: `🤖 Sedang memproses pertanyaan: **${message.substring(0, 100)}${message.length > 100 ? '...' : ''}**` 
        },
      });

      try {
        // Format prompt untuk Gemma
        const formattedPrompt = aiService.formatPrompt(message);
        
        // Send to AI
        const aiResult = await aiService.sendRequest(formattedPrompt);

        if (aiResult.success && aiResult.response) {
          // Limit response length untuk Discord (max 2000 chars)
          let response = aiResult.response;
          if (response.length > 1900) {
            response = response.substring(0, 1900) + '...';
          }

          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🤖 **AI Response untuk <@${userId}>:**\n\`\`\`${response}\`\`\``,
            },
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { 
              content: `❌ **AI Error:** ${aiResult.error || 'Tidak ada respon dari AI'}` 
            },
          });
        }
      } catch (error) {
        console.error('AI command error:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Terjadi error saat berkomunikasi dengan AI!' },
        });
      }
    },
    options: [
      {
        name: "pesan",
        description: "Pesan yang ingin dikirim ke AI",
        type: 3, // STRING
        required: true,
      },
    ],
  },
//   {
//     name: 'kirim_pesan',
//     description: 'Kirim pesan ke channel tertentu',
//     handler: async (req, res) => {
//       const channelId = req.body.data.options?.find((opt: any) => opt.name === 'channel')?.value;
//       const message = req.body.data.options?.find((opt: any) => opt.name === 'pesan')?.value;
//       const userId = req.body.member?.user?.id || req.body.user?.id;

//       if (!channelId || !message) {
//         return res.send({
//           type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//           data: { 
//             content: '❌ Harap masukkan channel dan pesan!',
//             flags: 64 // EPHEMERAL - hanya user yang bisa lihat
//           },
//         });
//       }

//       try {
//         // Import discord.js client (assuming it's available globally or can be imported)
//         const { Client } = await import('discord.js');
        
//         // Get the bot client instance (you'll need to pass this from main.ts)
//         const client = global.discordClient; // This would need to be set up properly
        
//         if (!client) {
//           return res.send({
//             type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//             data: { 
//               content: '❌ Bot client tidak tersedia!',
//               flags: 64
//             },
//           });
//         }

//         const channel = await client.channels.fetch(channelId);
        
//         if (!channel || !channel.isTextBased()) {
//           return res.send({
//             type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//             data: { 
//               content: '❌ Channel tidak ditemukan atau bukan text channel!',
//               flags: 64
//             },
//           });
//         }

//         // Send message to target channel
//         await channel.send(`📨 **Pesan dari <@${userId}>:**\n${message}`);

//         return res.send({
//           type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//           data: { 
//             content: `✅ Pesan berhasil dikirim ke <#${channelId}>!`,
//             flags: 64 // EPHEMERAL
//           },
//         });

//       } catch (error) {
//         console.error('Send message error:', error);
//         return res.send({
//           type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//           data: { 
//             content: '❌ Gagal mengirim pesan!',
//             flags: 64
//           },
//         });
//       }
//     },
//     options: [
//       {
//         name: "channel",
//         description: "Channel tujuan (mention atau ID)",
//         type: 7, // CHANNEL
//         required: true,
//       },
//       {
//         name: "pesan",
//         description: "Pesan yang ingin dikirim",
//         type: 3, // STRING
//         required: true,
//       },
//     ],
//   }
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
