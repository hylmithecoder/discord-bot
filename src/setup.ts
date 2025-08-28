import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ChannelType,
  PermissionFlagsBits
} from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  {
    name: "sapa",
    description: "Bot akan menyapamu",
  },
  {
    name: "play",
    description: "Play music dari Spotify/YouTube",
  },
  {
    name: "stop",
    description: "Stop musik yang sedang dimainkan",
  },
];

export function setCommand() {
  console.log("Set command");
  client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}`);

    try {
      // Daftarkan command global
      await client.application?.commands.set(commands);
      console.log("✅ Semua slash command berhasil didaftarkan!");

      // Cuma contoh: loop guild untuk info channel yang bisa dipakai
      for (const [guildId] of client.guilds.cache) {
        const guild = await client.guilds.fetch(guildId);
        const channels = await guild.channels.fetch();
        const me = await guild.members.fetch(client.user!.id);

        const target = channels.find(
          (ch) =>
            ch?.type === ChannelType.GuildText &&
            ch.isTextBased() &&
            ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
        );

        if (target && target.isTextBased()) {
          console.log(`✅ Bot siap di guild ${guild.name}`);
          // await target.send(`👋 Halo ${guild.name}, bot sudah online!`);
        }
      }
    } catch (err) {
      console.error("❌ Error saat set command:", err);
    }
  });
}

export async function interact() {

}
