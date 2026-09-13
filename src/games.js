const {
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./database");

const adminPermission = PermissionFlagsBits.ManageGuild;
const startingWords = ["kitap", "deniz", "güneş", "mutluluk", "şehir", "arkadaşlık", "başarı", "oyun"];
const validTurkishWords = [
    "araba", "ağaç", "açı", "anlam", "ayak", "balık", "beyaz", "bahçe", "cami", "çanta", "çilek", "duman", "duvar", "elma", "erkek", "fatura", "gökyüzü", "gül", "hava", "halı", "içim", "isim", "itfaiye", "kale", "karpuz", "kedi", "lale", "masa", "merdiven", "nisan", "okul", "orman", "otobüs", "pencere", "saat", "sıcak", "tahta", "uçak", "vadi", "yapay", "yaz", "zebra", "zeytin"
];
const tdkCache = new Map();
const boomSettingsCommand = new SlashCommandBuilder()
    .setName("boom_ayarlar")
    .setDescription("Boom oyunu ayarlarını yönetir.")
    .setDefaultMemberPermissions(adminPermission.toString())
    .addSubcommandGroup(group => group.setName("oyun").setDescription("Boom oyun ayarları.")
        .addSubcommand(sub => sub.setName("dil").setDescription("Boom oyun dilini ayarlar.").addStringOption(option => option.setName("dil").setDescription("Oyun dili.").addChoices({ name: "Türkçe", value: "tr" }, { name: "English", value: "en" }).setRequired(true)))
        .addSubcommand(sub => sub.setName("aralik").setDescription("Boom tur aralığını saniye olarak ayarlar.").addIntegerOption(option => option.setName("saniye").setDescription("Tur aralığı.").setMinValue(10).setMaxValue(86400).setRequired(true)))
        .addSubcommand(sub => sub.setName("odul").setDescription("Boom ödülünü ayarlar.").addIntegerOption(option => option.setName("miktar").setDescription("Ödül miktarı.").setMinValue(0).setMaxValue(2000000000).setRequired(true)))
        .addSubcommand(sub => sub.setName("sinir").setDescription("Boom sayısı için üst sınırı ayarlar.").addIntegerOption(option => option.setName("sayi").setDescription("En yüksek sayı. Her sayı bu değere ulaştığında boom olur.").setMinValue(2).setMaxValue(1000).setRequired(true))));

const boomGameCommand = new SlashCommandBuilder()
    .setName("boom_oyunu")
    .setDescription("Boom oyunu bilgilerini gösterir.")
    .addSubcommand(sub => sub.setName("benim").setDescription("Kendi Boom istatistiklerini gösterir."))
    .addSubcommand(sub => sub.setName("bilgi").setDescription("Boom oyunu hakkında bilgi verir."))
    .addSubcommand(sub => sub.setName("hatalar").setDescription("Boom oyunu hata kayıtlarını gösterir."));

const wordGameCommand = new SlashCommandBuilder()
    .setName("kelime_oyunu")
    .setDescription("Kelime oyunu bilgilerini gösterir.")
    .addSubcommand(sub => sub.setName("bilgi").setDescription("Kelime oyunu hakkında bilgi verir."))
    .addSubcommand(sub => sub.setName("kurallar").setDescription("Kelime oyunu kurallarını gösterir."))
    .addSubcommand(sub => sub.setName("puanim").setDescription("Kendi kelime oyunu puanını gösterir."))
    .addSubcommand(sub => sub.setName("puanlar").setDescription("Kelime oyunu puan tablosunu gösterir."));

const wordSettingsCommand = new SlashCommandBuilder()
    .setName("kelime_oyunu_ayarlar")
    .setDescription("Kelime oyunu ayarlarını yönetir.")
    .setDefaultMemberPermissions(adminPermission.toString())
    .addChannelOption(option => option.setName("kanal").setDescription("Kelime oyununun çalışacağı kanal.").addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addStringOption(option => option.setName("dil").setDescription("Kelime oyunu dili.").addChoices({ name: "Türkçe", value: "tr" }, { name: "English", value: "en" }).setRequired(false))
    .addStringOption(option => option.setName("kurallar").setDescription("Özel kural metni.").setMaxLength(1000).setRequired(false));

const boomCommand = new SlashCommandBuilder()
    .setName("boom")
    .setDescription("Boom oyun yönetimi.")
    .setDefaultMemberPermissions(adminPermission.toString())
    .addSubcommandGroup(group => group.setName("ayarlar").setDescription("Boom kanal ve istatistik ayarları.")
    .addSubcommand(sub => sub.setName("kanal-ekle").setDescription("Boom oyun kanalına ekler.").addChannelOption(option => option.setName("kanal").setDescription("Boom kanalını seç.").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(sub => sub.setName("kanal-kaldir").setDescription("Boom oyun kanalından çıkarır.").addChannelOption(option => option.setName("kanal").setDescription("Boom kanalını seç.").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sub => sub.setName("kanal-liste").setDescription("Boom oyun kanallarını listeler."))
        .addSubcommand(sub => sub.setName("istatistik").setDescription("Boom genel istatistiklerini gösterir.")));

const commands = [boomSettingsCommand, boomGameCommand, wordGameCommand, wordSettingsCommand, boomCommand].map(command => command.toJSON());

function hidden(content, embeds) { return { content, embeds, flags: MessageFlags.Ephemeral }; }
function isAdmin(interaction) { return interaction.memberPermissions?.has(adminPermission); }
async function requireAdmin(interaction) { if (isAdmin(interaction)) return true; await interaction.reply(hidden("Bu ayar komutu yalnızca yöneticiler tarafından kullanılabilir.")); return false; }
function games(guildId) { return getGuildSettings(guildId).games; }
function statsRecord(stats, userId) { if (!stats[userId]) stats[userId] = { points: 0, wins: 0, games: 0 }; return stats[userId]; }
function leaderboard(stats) { return Object.entries(stats).sort(([, first], [, second]) => (second.points || 0) - (first.points || 0)).slice(0, 10); }
function userTag(interaction, userId) { return `<@${userId}>`; }

async function handleBoomSettings(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const settings = games(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "dil") settings.boom.language = interaction.options.getString("dil");
    if (subcommand === "aralik") settings.boom.intervalSeconds = interaction.options.getInteger("saniye");
    if (subcommand === "odul") settings.boom.reward = interaction.options.getInteger("miktar");
    if (subcommand === "sinir") settings.boom.maxNumber = interaction.options.getInteger("sayi");
    updateGuildSettings(interaction.guildId, current => ({ ...current, games: settings }));
    await interaction.reply(hidden("Boom oyun ayarı güncellendi."));
}

async function handleBoomGame(interaction) {
    const settings = games(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "bilgi") {
        await interaction.reply(hidden("Boom oyunu sayı sayma oyunudur. Oynayanlar sırayla 1, 2, 3... şeklinde sayı yazar. Aynı kişi iki kez yazarsa veya sıra dışı sayı yazarsa yanlış olur. Belirlenen sayı limitine ulaşınca bot " + "BOOM" + " yazar ve tur sıfırlanır."));
        return;
    }
    if (subcommand === "hatalar") {
        const errors = settings.boom.errors.slice(-10).map(error => `• ${error}`).join("\n") || "Kayıtlı hata yok.";
        await interaction.reply(hidden(errors));
        return;
    }
    const record = statsRecord(settings.boom.stats, interaction.user.id);
    await interaction.reply(hidden(`${userTag(interaction, interaction.user.id)}\nBoom puanın: **${record.points || 0}**\nKazanılan tur: **${record.wins || 0}**\nOynanan tur: **${record.games || 0}**`));
}

async function handleWordGame(interaction) {
    const settings = games(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "bilgi") { await interaction.reply(hidden("Kelime oyunu, kelimelerle puan topladığın ve sunucu sıralamasında yükseldiğin oyundur.")); return; }
    if (subcommand === "kurallar") { await interaction.reply(hidden(settings.word.rules)); return; }
    if (subcommand === "puanim") {
        const record = statsRecord(settings.word.stats, interaction.user.id);
        await interaction.reply(hidden(`Kelime oyunu puanın: **${record.points || 0}**`));
        return;
    }
    const lines = leaderboard(settings.word.stats).map(([userId, record], index) => `**${index + 1}.** <@${userId}> - ${record.points || 0} puan`);
    await interaction.reply(hidden(lines.join("\n") || "Henüz kelime oyunu puanı yok."));
}

async function handleWordSettings(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const settings = games(interaction.guildId);
    const channel = interaction.options.getChannel("kanal");
    const language = interaction.options.getString("dil");
    const rules = interaction.options.getString("kurallar");
    if (channel) {
        settings.word.channelId = channel.id;
        settings.word.usedWords = [];
        const firstWord = validTurkishWords[Math.floor(Math.random() * validTurkishWords.length)];
        settings.word.lastWord = firstWord;
        settings.word.lastPlayerId = "bot";
        settings.word.usedWords.push(firstWord);
        await channel.send(`Kelime oyunu başladı! İlk kelime: **${firstWord}**\nSonraki kelime, önceki kelimenin son harfiyle başlamalı.`).catch(() => undefined);
    }
    if (language) settings.word.language = language;
    if (rules) settings.word.rules = rules;
    updateGuildSettings(interaction.guildId, current => ({ ...current, games: settings }));
    await interaction.reply(hidden("Kelime oyunu ayarları güncellendi."));
}

async function handleBoom(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const settings = games(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "kanal-ekle" || subcommand === "kanal-kaldir") {
        const channelId = interaction.options.getChannel("kanal").id;
        if (subcommand === "kanal-ekle" && !settings.boom.channels.includes(channelId)) settings.boom.channels.push(channelId);
        if (subcommand === "kanal-kaldir") settings.boom.channels = settings.boom.channels.filter(id => id !== channelId);
        updateGuildSettings(interaction.guildId, current => ({ ...current, games: settings }));
        await interaction.reply(hidden(`Boom kanal ayarı güncellendi: <#${channelId}>`));
        return;
    }
    if (subcommand === "kanal-liste") {
        await interaction.reply(hidden(settings.boom.channels.map(channelId => `<#${channelId}>`).join("\n") || "Tanımlı Boom kanalı yok."));
        return;
    }
    const totalGames = Object.values(settings.boom.stats).reduce((sum, record) => sum + (record.games || 0), 0);
    const totalWins = Object.values(settings.boom.stats).reduce((sum, record) => sum + (record.wins || 0), 0);
    await interaction.reply(hidden(`Boom istatistikleri\nOyuncu sayısı: **${Object.keys(settings.boom.stats).length}**\nOynanan tur: **${totalGames}**\nKazanılan tur: **${totalWins}**\nÖdül: **${settings.boom.reward}**\nSınır: **${settings.boom.maxNumber || 20}**`));
}

function normalizeWord(value) {
    return String(value || "").toLocaleLowerCase("tr-TR").trim().replace(/[^a-zçğıöşü]/g, "");
}
function isValidWord(word) {
    const normalized = normalizeWord(word);
    if (!normalized || normalized.length < 2) return false;
    if (!/^[a-zçğıöşü]+$/i.test(normalized)) return false;
    return validTurkishWords.includes(normalized);
}
function pickBotWord(previousWord, usedWords = []) {
    const lastLetter = previousWord ? normalizeWord(previousWord).slice(-1) : null;
    const candidates = validTurkishWords.filter(word => {
        const normalized = normalizeWord(word);
        if (usedWords.includes(normalized)) return false;
        if (!lastLetter) return true;
        return normalized.startsWith(lastLetter);
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}
async function tdkWordExists(word) {
    const cached = tdkCache.get(word);
    if (cached && cached.expiresAt > Date.now()) return cached.exists;
    try {
        const response = await fetch(`https://sozluk.gov.tr/gts?ara=${encodeURIComponent(word)}`, {
            headers: { "User-Agent": "TPM-Discord-Word-Game/1.0" },
            signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) return false;
        const result = await response.json();
        const exists = Array.isArray(result) && result.length > 0 && !result[0]?.error;
        tdkCache.set(word, { exists, expiresAt: Date.now() + 10 * 60 * 1000 });
        return exists;
    } catch {
        return false;
    }
}
async function handleGameMessage(message) {
    if (!message.guild || message.author.bot) return;
    const settings = games(message.guild.id);
    if (settings.boom.channels.includes(message.channel.id)) {
        const value = message.content.trim();
        if (!/^\d+$/.test(value)) return;
        const number = Number(value);
        const boom = settings.boom;
        const record = statsRecord(boom.stats, message.author.id);
        record.games = (record.games || 0) + 1;

        if (boom.lastPlayerId === message.author.id || number !== boom.expectedNumber) {
            boom.errors.push(`${new Date().toISOString()} ${message.author.tag}: beklenen ${boom.expectedNumber}, yazılan ${number}`);
            if (typeof message.react === "function") {
                await message.react("❌").catch(() => undefined);
            }
            updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
            return;
        }

        if (typeof message.react === "function") {
            await message.react("✅").catch(() => undefined);
        }
        record.points = (record.points || 0) + 1;
        boom.lastPlayerId = message.author.id;

        if (number >= (boom.maxNumber || 20)) {
            boom.expectedNumber = 1;
            boom.lastPlayerId = null;
            record.wins = (record.wins || 0) + 1;
            await message.channel.send(`💥 BOOM! Sıra sıfırlandı. Yeni tur başlıyor.`).catch(() => undefined);
            updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
            return;
        }

        boom.expectedNumber += 1;
        updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
        return;
    }
    if (settings.word.channelId !== message.channel.id) return;
    const wordSettings = settings.word;
    const usedWords = Array.isArray(wordSettings.usedWords) ? wordSettings.usedWords : [];

    if (!wordSettings.lastWord) {
        const firstWord = pickBotWord(null, usedWords);
        if (!firstWord) {
            await message.channel.send("Kelime havuzunda uygun kelime kalmadı.").catch(() => undefined);
            return;
        }
        wordSettings.lastWord = firstWord;
        wordSettings.lastPlayerId = "bot";
        usedWords.push(firstWord);
        wordSettings.usedWords = usedWords;
        updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
        await message.channel.send(`Kelime oyunu başladı! İlk kelime: **${firstWord}**`).catch(() => undefined);
        return;
    }

    const word = normalizeWord(message.content);
    if (!word) return;

    const previousWord = normalizeWord(wordSettings.lastWord || "");
    const expectedStart = previousWord ? previousWord.slice(-1) : "";
    const record = statsRecord(wordSettings.stats, message.author.id);
    record.games = (record.games || 0) + 1;

    if (!word || word.length < 2 || !/^[a-zçğıöşü]+$/i.test(word) || !isValidWord(word) || usedWords.includes(word) || word.startsWith(expectedStart) === false) {
        if (typeof message.react === "function") {
            await message.react("❌").catch(() => undefined);
        }
        const reason = !word || word.length < 2
            ? "Geçersiz kelime."
            : !isValidWord(word)
                ? "Bu kelime Türkçe/uygun bir kelime değil."
                : usedWords.includes(word)
                    ? "Bu kelime daha önce kullanıldı."
                    : `Bu kelime ${expectedStart.toUpperCase()} harfiyle başlamalı.`;
        await message.reply(`❌ ${reason} Lütfen tekrar doğru kelime yaz.`).catch(() => undefined);
        updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
        return;
    }

    if (typeof message.react === "function") {
        await message.react("✅").catch(() => undefined);
    }
    record.points = (record.points || 0) + 1;
    wordSettings.lastPlayerId = message.author.id;
    wordSettings.lastWord = word;
    usedWords.push(word);
    wordSettings.usedWords = usedWords;
    updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));

    const botWord = pickBotWord(word, wordSettings.usedWords || []);
    if (!botWord) {
        await message.channel.send("✅ Doğru! Uygun kelime kalmadı, oyun bitti.").catch(() => undefined);
        return;
    }

    wordSettings.lastWord = botWord;
    wordSettings.lastPlayerId = "bot";
    wordSettings.usedWords = [...(wordSettings.usedWords || []), botWord];
    await message.channel.send(`✅ Doğru! Bot yazdı: **${botWord}**`).catch(() => undefined);
    updateGuildSettings(message.guild.id, current => ({ ...current, games: settings }));
}

const handlers = {
    "boom_ayarlar": handleBoomSettings,
    "boom_oyunu": handleBoomGame,
    "kelime_oyunu": handleWordGame,
    "kelime_oyunu_ayarlar": handleWordSettings,
    boom: handleBoom
};
module.exports = { commands, handlers, handleGameMessage };
