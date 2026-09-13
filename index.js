require("dotenv").config();

const {
	Client,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder
} = require("discord.js");
const ticketSystem = require("./src/ticketSystem");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const commands = [
	new SlashCommandBuilder()
		.setName("destek")
		.setDescription("Destek sistemi yönetimi")
		.addSubcommand(subcommand => subcommand.setName("kur").setDescription("Destek kategorileri için rolleri ayarla"))
		.addSubcommand(subcommand => subcommand.setName("panel").setDescription("Destek panelini gönder"))
].map(command => command.toJSON());

async function registerCommands() {
	if (!process.env.CLIENT_ID || !process.env.DISCORD_TOKEN) {
		throw new Error("CLIENT_ID ve DISCORD_TOKEN .env içinde tanımlanmalıdır.");
	}

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
	const route = process.env.GUILD_ID
		? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
		: Routes.applicationCommands(process.env.CLIENT_ID);
	await rest.put(route, { body: commands });
}

client.once("ready", async readyClient => {
	await registerCommands();
	console.log(`${readyClient.user.tag} olarak giriş yapıldı.`);
});

client.on("interactionCreate", async interaction => {
	try {
		if (interaction.isChatInputCommand() && interaction.commandName === "destek") {
			if (interaction.options.getSubcommand() === "kur") {
				await ticketSystem.openSetupModal(interaction);
			} else {
				await ticketSystem.sendSupportPanel(interaction);
			}
			return;
		}

		if (interaction.isModalSubmit() && interaction.customId === "support-config") {
			await ticketSystem.saveSetupModal(interaction);
			return;
		}

		if (interaction.isStringSelectMenu() && interaction.customId === "support-category") {
			await ticketSystem.createTicket(interaction);
			return;
		}

		if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
			await ticketSystem.handleTicketButton(interaction);
		}
	} catch (error) {
		console.error(error);
		const reply = { content: "İşlem sırasında bir hata oluştu.", ephemeral: true };
		if (interaction.deferred || interaction.replied) {
			await interaction.editReply(reply).catch(() => undefined);
		} else {
			await interaction.reply(reply).catch(() => undefined);
		}
	}
});

if (!process.env.DISCORD_TOKEN) {
	console.error("DISCORD_TOKEN .env içinde tanımlı değil.");
} else {
	client.login(process.env.DISCORD_TOKEN);
}

