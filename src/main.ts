import 'dotenv/config'
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js'
import slashCommandsExport, { handleRouter } from './router.js'
import testSpotify from './musichandler.js'
import { YoutubeMusicPlayer } from './musichandler.js'

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

export function exportClient(){
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
        // Uncomment jika ingin kirim pesan otomatis
        // await target.send(`👋 Halo ${guild.name}, bot sudah online dengan ${slashCommands.length} commands!`)
        console.log(`✅ Bot siap di server ${guild.name}`)
      }
    } catch (err) {
      console.error(`❌ Error di server ${guildId}:`, err)
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