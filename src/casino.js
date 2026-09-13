const crypto = require("node:crypto");
const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./database");

const CASINO_CHANNEL_ID = process.env.CASINO_CHANNEL_ID || "1547556728072175616";
const GAME_CHANNEL_ID = "1547556728072175616";
const MONEY_EMOJI = "<:emoji_1:1547615819767353394>";
const STARTING_BALANCE = 1000;
const MAX_BET = 1000000;

const commands = [
    new SlashCommandBuilder()
        .setName("oyunlar")
        .setDescription("Kumarhane oyunlarını oynar.")
        .addSubcommand(subcommand => subcommand.setName("blackjack").setDescription("Blackjack oynar.").addIntegerOption(option => option.setName("bahis").setDescription("Bahis miktarı.").setMinValue(1).setMaxValue(MAX_BET).setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName("horoz-dovusu").setDescription("Horoz dövüşüne bahis yapar.").addStringOption(option => option.setName("secim").setDescription("Horoz seçimi.").addChoices({ name: "Siyah", value: "black" }, { name: "Jet", value: "jet" }).setRequired(true)).addIntegerOption(option => option.setName("bahis").setDescription("Bahis miktarı.").setMinValue(1).setMaxValue(MAX_BET).setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName("rulet").setDescription("Rulet oynar.").addStringOption(option => option.setName("renk").setDescription("Bahis rengi.").addChoices({ name: "Kırmızı", value: "red" }, { name: "Siyah", value: "black" }, { name: "Yeşil", value: "green" }).setRequired(true)).addIntegerOption(option => option.setName("bahis").setDescription("Bahis miktarı.").setMinValue(1).setMaxValue(MAX_BET).setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName("rus-ruleti").setDescription("Rus ruleti oynar.").addIntegerOption(option => option.setName("bahis").setDescription("Bahis miktarı.").setMinValue(1).setMaxValue(MAX_BET).setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName("slotlar").setDescription("Slot oynar.").addIntegerOption(option => option.setName("bahis").setDescription("Bahis miktarı.").setMinValue(1).setMaxValue(MAX_BET).setRequired(true)))
].map(command => command.toJSON());

const slotSymbols = ["🍒", "🍋", "🔔", "⭐", "7️⃣"];
const colorNames = { red: "Kırmızı", black: "Siyah", green: "Yeşil" };

function random(max) { return crypto.randomInt(0, max); }
function formatMoney(amount) { return `${Math.max(0, Math.floor(amount)).toLocaleString("tr-TR")} ${MONEY_EMOJI}`; }
function getCasinoData(guildId) {
    const data = getGuildSettings(guildId);
    if (!data.casino || typeof data.casino !== "object") data.casino = {};
    if (!data.casino.users || typeof data.casino.users !== "object") data.casino.users = {};
    return data;
}
function getWallet(data, userId) {
    if (!data.casino.users[userId] || typeof data.casino.users[userId] !== "object") data.casino.users[userId] = { balance: STARTING_BALANCE, wins: 0, losses: 0 };
    const wallet = data.casino.users[userId];
    wallet.balance = Number.isFinite(wallet.balance) ? Math.max(0, Math.floor(wallet.balance)) : STARTING_BALANCE;
    wallet.wins = Number.isFinite(wallet.wins) ? wallet.wins : 0;
    wallet.losses = Number.isFinite(wallet.losses) ? wallet.losses : 0;
    return wallet;
}
function saveCasino(guildId, data) { updateGuildSettings(guildId, () => data); }
function finishEmbed(title, description, balance, color) {
    return new EmbedBuilder().setColor(color).setTitle(title).setDescription(`${description}\n\n**Güncel bakiye:** ${formatMoney(balance)}`);
}
function validBet(wallet, bet) {
    return Number.isInteger(bet) && bet > 0 && bet <= MAX_BET && bet <= wallet.balance;
}
function rollDie() { return random(6) + 1; }
function blackjackTotal(cards) { return cards.reduce((total, card) => total + card, 0); }

async function handleLeaderboard(interaction, data) {
    const entries = Object.entries(data.casino.users).map(([userId, wallet]) => ({ userId, balance: Number(wallet.balance) || 0 })).sort((a, b) => b.balance - a.balance).slice(0, 9);
    const lines = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const user = await interaction.client.users.fetch(entry.userId).catch(() => null);
        const rank = ["🥇", "🥈", "🥉"][index] || `**${index + 1}.**`;
        lines.push(`${rank} ${user ? user.tag : `<@${entry.userId}>`} - ${formatMoney(entry.balance)}`);
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("Kumarhane Liderlik Tablosu").setDescription(lines.join("\n") || "Henüz sıralamada kimse yok.")] });
}

async function handleCasino(interaction) {
    if (interaction.channelId !== GAME_CHANNEL_ID) {
        await interaction.reply({ content: `Bu komut yalnızca <#${GAME_CHANNEL_ID}> kanalında kullanılabilir.`, flags: MessageFlags.Ephemeral });
        return;
    }
    const data = getCasinoData(interaction.guildId);
    const wallet = getWallet(data, interaction.user.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "bakiye") {
        await interaction.reply({ embeds: [finishEmbed("Kumarhane Bakiyesi", `**${interaction.user.tag}**\nKazanç: ${wallet.wins}\nKayıp: ${wallet.losses}`, wallet.balance, 0x3498db)] });
        return;
    }
    if (subcommand === "kara-para-gonder") {
        const target = interaction.options.getUser("hedef");
        const amount = interaction.options.getInteger("miktar");
        if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: "Kendine veya botlara para gönderemezsin.", flags: MessageFlags.Ephemeral });
        if (!validBet(wallet, amount)) return interaction.reply({ content: "Geçerli ve bakiyeni aşmayan bir miktar gir.", flags: MessageFlags.Ephemeral });
        const targetWallet = getWallet(data, target.id);
        wallet.balance -= amount;
        targetWallet.balance += amount;
        saveCasino(interaction.guildId, data);
        await interaction.reply({ embeds: [finishEmbed("Para Gönderildi", `${target} kullanıcısına ${formatMoney(amount)} gönderildi.`, wallet.balance, 0x2ecc71)] });
        return;
    }
    if (subcommand === "soygun") {
        const target = interaction.options.getUser("hedef");
        const targetWallet = getWallet(data, target.id);
        if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: "Kendini veya botları soyamazsın.", flags: MessageFlags.Ephemeral });
        if (targetWallet.balance < 100) return interaction.reply({ content: "Hedefin soyulabilecek en az 100 bakiyesi olmalı.", flags: MessageFlags.Ephemeral });
        const success = random(100) < 35;
        const amount = Math.min(targetWallet.balance, Math.max(100, Math.floor(targetWallet.balance * 0.2)));
        if (success) { targetWallet.balance -= amount; wallet.balance += amount; wallet.wins += 1; } else { wallet.balance = Math.max(0, wallet.balance - Math.min(wallet.balance, 100)); wallet.losses += 1; }
        saveCasino(interaction.guildId, data);
        await interaction.reply({ embeds: [finishEmbed(success ? "Soygun Başarılı" : "Soygun Başarısız", success ? `${target} kullanıcısından ${formatMoney(amount)} aldın.` : "Yakalandın ve 100 para ceza ödedin.", wallet.balance, success ? 0x2ecc71 : 0xe74c3c)] });
        return;
    }

    const bet = interaction.options.getInteger("bahis");
    if (!validBet(wallet, bet)) { await interaction.reply({ content: `Bahsin 1-${MAX_BET} arasında ve bakiyen kadar olmalı.`, flags: MessageFlags.Ephemeral }); return; }
    let title = "Kumarhane", description = "", won = false, payout = bet;
    if (subcommand === "slots" || subcommand === "slotlar") {
        const rolls = [slotSymbols[random(slotSymbols.length)], slotSymbols[random(slotSymbols.length)], slotSymbols[random(slotSymbols.length)]];
        const same = rolls[0] === rolls[1] && rolls[1] === rolls[2];
        const pair = rolls[0] === rolls[1] || rolls[1] === rolls[2] || rolls[0] === rolls[2];
        won = same || pair;
        payout = same ? bet * 5 : bet * 2;
        title = "Slotlar"; description = `${rolls.join(" | ")}\n${same ? "Üçlü eşleşme!" : pair ? "İkili eşleşme!" : "Eşleşme yok."}`;
    } else if (subcommand === "rulet") {
        const number = random(37); const result = number === 0 ? "green" : number % 2 ? "red" : "black";
        won = interaction.options.getString("renk") === result; payout = result === "green" ? bet * 14 : bet * 2;
        title = "Rulet"; description = `Gelen sayı: **${number} (${colorNames[result]})**\nSeçimin: ${colorNames[interaction.options.getString("renk")]}`;
    } else if (subcommand === "zar") {
        const userRoll = rollDie(); const houseRoll = rollDie(); won = userRoll > houseRoll; payout = bet * 2;
        title = "Zar"; description = `Sen: **${userRoll}** | Kasa: **${houseRoll}**`;
    } else if (subcommand === "horoz-dovusu") {
        const winner = random(2) ? "black" : "jet"; won = interaction.options.getString("secim") === winner;
        title = "Horoz Dövüşü"; description = `Kazanan horoz: **${winner === "black" ? "Siyah" : "Jet"}**`;
    } else if (subcommand === "blackjack") {
        const player = blackjackTotal([random(10) + 2, random(10) + 2]); const dealer = blackjackTotal([random(10) + 2, random(10) + 2]);
        won = player <= 21 && (dealer > 21 || player > dealer); payout = player === 21 ? bet * 3 : bet * 2;
        title = "Blackjack"; description = `Sen: **${player}** | Kasa: **${dealer}**`;
    }
    if (won) { wallet.balance += payout; wallet.wins += 1; } else { wallet.balance -= bet; wallet.losses += 1; }
    saveCasino(interaction.guildId, data);
    await interaction.reply({ embeds: [finishEmbed(title, `${description}\n${won ? `Kazandın: ${formatMoney(payout)}` : `Kaybettin: ${formatMoney(bet)}`}`, wallet.balance, won ? 0x2ecc71 : 0xe74c3c)] });
}

async function handleKumar(interaction) {
    if (interaction.channelId !== GAME_CHANNEL_ID) { await interaction.reply({ content: `Bu komut yalnızca <#${GAME_CHANNEL_ID}> kanalında kullanılabilir.`, flags: MessageFlags.Ephemeral }); return; }
    await handleLeaderboard(interaction, getCasinoData(interaction.guildId));
}

async function handleOyunlar(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== "rus-ruleti") {
        await handleCasino(interaction);
        return;
    }
    if (interaction.channelId !== GAME_CHANNEL_ID) {
        await interaction.reply({ content: `Bu komut yalnızca <#${GAME_CHANNEL_ID}> kanalında kullanılabilir.`, flags: MessageFlags.Ephemeral });
        return;
    }
    const data = getCasinoData(interaction.guildId);
    const wallet = getWallet(data, interaction.user.id);
    const bet = interaction.options.getInteger("bahis");
    if (!validBet(wallet, bet)) {
        await interaction.reply({ content: `Bahsin 1-${MAX_BET} arasında ve bakiyen kadar olmalı.`, flags: MessageFlags.Ephemeral });
        return;
    }
    const survived = random(6) !== 0;
    const payout = bet * 5;
    if (survived) {
        wallet.balance += payout;
        wallet.wins += 1;
    } else {
        wallet.balance -= bet;
        wallet.losses += 1;
    }
    saveCasino(interaction.guildId, data);
    await interaction.reply({ embeds: [finishEmbed("Rus Ruleti", survived ? `Tetiği çektin ve hayatta kaldın. Kazancın: ${formatMoney(payout)}` : `Mermi çıktı. Kaybın: ${formatMoney(bet)}`, wallet.balance, survived ? 0x2ecc71 : 0xe74c3c)] });
}

module.exports = { commands, handleCasino, handleKumar, handleOyunlar };