require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    MessageFlags,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");
const ticketSystem = require("./src/ticketSystem");
const moderation = require("./src/moderation");
const casino = require("./src/casino");
const announcement = require("./src/announcement");
const voicePanel = require("./src/voicePanel");
const economy = require("./src/economy");
const games = require("./src/games");
const roblox = require("./src/roblox");
const messageCreateEvent = require("./src/events/messageCreate"); // src/events/messageCreate.js çağrıldı

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent // Mesaj okuma izni eklendi
    ] 
});

const supportCommand = new SlashCommandBuilder()
    .setName("destek")
    .setDescription("Destek sistemi yönetimi")
    .addSubcommand(subcommand => subcommand.setName("kur").setDescription("Destek sistemini kur"));
const commands = [supportCommand.toJSON(), ...moderation.commands, ...casino.commands, ...announcement.commands, ...voicePanel.commands, ...economy.commands, ...games.commands, ...roblox.commands];
const moderationCommandNames = new Set(moderation.commands.map(command => command.name));
const casinoCommandNames = new Set(casino.commands.map(command => command.name));
const privateResultCommands = new Set(["ekonomi", "gelir", "itemler", "item", "oyunlar"]);
const COMMAND_CHANNEL_ID = "1547556728072175616";
const RESULT_CHANNEL_ID = "1547616067671560313";

function sendPrivateResultToChannel(interaction) {
    if (!privateResultCommands.has(interaction.commandName) || interaction.channelId !== COMMAND_CHANNEL_ID) return;
    const originalReply = interaction.reply.bind(interaction);
    interaction.reply = async payload => {
        const mention = `<@${interaction.user.id}>`;
        const privatePayload = typeof payload === "string" ? { content: payload } : { ...payload };
        privatePayload.content = privatePayload.content ? `${mention} ${privatePayload.content}` : mention;
        privatePayload.flags = MessageFlags.Ephemeral;
        const publicPayload = { ...privatePayload };
        delete publicPayload.flags;
        delete publicPayload.ephemeral;
        const resultChannel = interaction.guild?.channels.cache.get(RESULT_CHANNEL_ID);
        const replyResult = await originalReply(privatePayload);
        if (resultChannel?.isTextBased()) await resultChannel.send(publicPayload).catch(() => undefined);
        return replyResult;
    };
}

async function registerCommands(applicationId) {
    if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN ortam değişkeninde tanımlı değil.");
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    const globalRoute = Routes.applicationCommands(applicationId);
    await rest.put(globalRoute, { body: [] });
    for (const guild of client.guilds.cache.values()) {
        await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), { body: commands });
    }
    if (process.env.GUILD_ID && !client.guilds.cache.has(process.env.GUILD_ID)) {
        await rest.put(Routes.applicationGuildCommands(applicationId, process.env.GUILD_ID), { body: commands });
    }
}

client.once("ready", async readyClient => {
    try {
        await registerCommands(process.env.CLIENT_ID || readyClient.application.id);
        console.log(`${readyClient.user.tag} olarak giriş yapıldı.`);
    } catch (error) {
        console.error("Slash komutları kaydedilemedi:", error);
        await readyClient.destroy();
    }
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === "terfi" || interaction.commandName === "tenzil") {
                await roblox.roleAutocomplete(interaction);
            }
            return;
        }
        if (interaction.isChatInputCommand()) {
            sendPrivateResultToChannel(interaction);
            if (interaction.commandName === "ses-panel") {
                await voicePanel.sendPanel(interaction);
                return;
            }
            if (interaction.commandName === "ekonomi") {
                await economy.handleEconomy(interaction);
                return;
            }
            if (interaction.commandName === "gelir") {
                await economy.handleIncome(interaction);
                return;
            }
            if (interaction.commandName === "itemler") {
                await economy.handleItems(interaction);
                return;
            }
            if (interaction.commandName === "item") {
                await economy.handleItemManage(interaction);
                return;
            }
            if (["roblox", "terfi", "tenzil"].includes(interaction.commandName)) {
                await roblox.handleRoblox(interaction);
                return;
            }
            if (games.handlers[interaction.commandName]) {
                await games.handlers[interaction.commandName](interaction);
                return;
            }
            if (interaction.commandName === "destek") {
                await ticketSystem.openSetup(interaction);
                return;
            }
            if (moderationCommandNames.has(interaction.commandName)) {
                await moderation.handleModeration(interaction);
                return;
            }
            if (casinoCommandNames.has(interaction.commandName)) {
                if (interaction.commandName === "oyunlar") await casino.handleOyunlar(interaction);
                else await casino.handleCasino(interaction);
                return;
            }
            if (interaction.commandName === "duyur") {
                await announcement.handleAnnouncement(interaction);
                return;
            }
        }
        if (interaction.isModalSubmit() && interaction.customId.startsWith("voice:")) {
            await voicePanel.handleModal(interaction);
            return;
        }
        if ((interaction.isUserSelectMenu() || interaction.isRoleSelectMenu()) && interaction.customId.startsWith("voice:")) {
            await voicePanel.handleSelect(interaction);
            return;
        }
        if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
            if (interaction.customId.startsWith("support-setup:")) await ticketSystem.handleSetupSelect(interaction);
            return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId === "support-category") {
            await ticketSystem.createTicket(interaction);
            return;
        }
        if (interaction.isButton()) {
            if (interaction.customId.startsWith("voice:")) await voicePanel.handleButton(interaction);
            else if (interaction.customId.startsWith("support-setup:")) await ticketSystem.handleSetupButton(interaction);
            else if (interaction.customId.startsWith("ticket:")) await ticketSystem.handleTicketButton(interaction);
        }
    } catch (error) {
        console.error(error);
        if (interaction.isAutocomplete()) {
            await interaction.respond([]).catch(() => undefined);
            return;
        }
        const reply = { content: "İşlem sırasında bir hata oluştu.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => undefined);
        else await interaction.reply(reply).catch(() => undefined);
    }
});

// Hem otomatik cevaplar hem oyunlar bağımsız çalışır
client.on("messageCreate", async message => {
    await messageCreateEvent.execute(message).catch(error => console.error("Otomatik cevap işlenemedi:", error));
    await games.handleGameMessage(message).catch(error => console.error("Oyun mesajı işlenemedi:", error));
});

if (!process.env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN ortam değişkeninde tanımlı değil.");
    process.exitCode = 1;
} else {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error("Discord bağlantısı kurulamadı:", error.message);
        process.exitCode = 1;
    });
}
