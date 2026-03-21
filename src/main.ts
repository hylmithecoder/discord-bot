import 'dotenv/config'
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js'
import slashCommandsExport, { handleRouter } from './router.js'
import testSpotify from './musichandler.js'
import { YoutubeMusicPlayer } from './musichandler.js'
import { BanWord } from './banword.js'

const banword = new BanWord()

const yt = new YoutubeMusicPlayer()

console.log("Youtube")
yt.searchYoutubeAPI("Dan da dan")
// === GATEWAY CLIENT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
})

export function exportClient() {
  return client
}

// === FUNCTION TO REGISTER SLASH COMMANDS ===
async function registerSlashCommands() {
  try {
    console.log('🔄 Mendaftarkan slash commands...')

    for (const command of slashCommandsExport()) {
      await client.application?.commands.create({
        name: command.name,
        description: command.description,
        options: command.options?.map((option) => ({
          name: option.name,
          description: option.description,
          type: option.type,
          // required: option.required,
          // choices: option.choices,
        })),
      })
      console.log(`Detail parameter: ${JSON.stringify(command)}`)
      console.log(`✅ Command /${command.name} berhasil didaftarkan!`)
    }

    console.log('🎉 Semua slash commands berhasil didaftarkan!')
  } catch (error) {
    console.error('❌ Error saat mendaftarkan commands:', error)
  }
}

// === BOT READY EVENT ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`)

  // Init banword system
  await banword.init()

  // Daftarkan slash commands
  await registerSlashCommands()

  // Kirim pesan otomatis ke setiap guild (opsional)
  for (const [guildId] of client.guilds.cache) {
    try {
      const guild = await client.guilds.fetch(guildId)
      const channels = await guild.channels.fetch()
      const me = await guild.members.fetch(client.user!.id)

      const target = channels.find(
        (ch) =>
          ch?.type === ChannelType.GuildText &&
          ch.isTextBased() &&
          ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages),
      )

      if (target && target.isTextBased()) {
        console.log(`✅ Bot siap di server ${guild.name}`)
      }
    } catch (err) {
      console.error(`❌ Error di server ${guildId}:`, err)
    }
  }
})

// === BANWORD AUTO-DELETE & WARNING ===
client.on('messageCreate', async (message) => {
  // Abaikan pesan dari bot sendiri
  if (message.author.bot) return
  if (!message.guild) return

  const content = message.content
  if (!content) return

  // Cek apakah pesan mengandung banword
  if (banword.checkMessage(content)) {
    const foundWords = banword.getFoundBanwords(content)
    const userId = message.author.id
    const username = message.author.username

    console.log(`🚨 Banword detected from ${username}: "${content}"`)
    console.log(`   Words found: ${foundWords.join(', ')}`)

    // Record violation
    const record = await banword.recordViolation(userId, username, foundWords)

    // 1. Hapus pesan
    try {
      await message.delete()
      console.log(`🗑️ Message deleted from ${username}`)
    } catch (err) {
      console.error(`❌ Gagal hapus pesan:`, err)
    }

    // 2. Kirim peringatan di channel
    try {
      const warningLevel = record.violations >= 5 ? '🔴' : record.violations >= 3 ? '🟠' : '🟡'
      const warningMsg = await message.channel.send(
        `${warningLevel} <@${userId}> Pesan kamu dihapus karena mengandung kata terlarang!\n` +
        `⚠️ Pelanggaran ke-**${record.violations}** — Jaga bahasamu ya!`
      )
      // Auto-delete warning setelah 8 detik
      setTimeout(() => warningMsg.delete().catch(() => { }), 8000)
    } catch (err) {
      console.error(`❌ Gagal kirim peringatan:`, err)
    }

    // 3. Kirim DM ke user
    try {
      await message.author.send(
        `⚠️ **Peringatan dari server ${message.guild.name}**\n\n` +
        `Pesan kamu dihapus karena mengandung kata terlarang: ||${foundWords.join(', ')}||\n` +
        `📊 Total pelanggaran kamu: **${record.violations}**\n\n` +
        `Tolong jaga bahasamu. Pelanggaran berulang bisa kena sanksi! 🙏`
      )
    } catch {
      // User mungkin block DM, skip
    }
  }
})

client.login(process.env['DISCORD_TOKEN'])

testSpotify()

const app = handleRouter()

// Only listen if not running as a Vercel serverless function
if (process.env['NODE_ENV'] !== 'production' || !process.env['VERCEL']) {
  const PORT = process.env['PORT'] || 3001
  app.listen(PORT, () => {
    console.log(`🌐 Express server listening on port ${PORT}`)
  })
}

export default app