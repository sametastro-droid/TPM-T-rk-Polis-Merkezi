const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || path.join(__dirname, "../data"));
const databaseFile = path.join(dataDirectory, "guild-settings.json");
const categoryKeys = ["discord", "oyunIci", "gamepass", "transfer"];

function defaultSettings() {
    return {
        panelChannelId: null,
        ticketCategoryId: null,
        supportRoles: { discord: [], oyunIci: [], gamepass: [], transfer: [] },
        openTickets: {},
        voicePanelCategoryId: null,
        economy: {
            startingBalance: 1000,
            maximumBalance: 1000000,
            moneyEmoji: "<:emoji_1:1547615819767353394>",
            auditEnabled: true,
            users: {},
            roleIncome: {},
            items: {}
        },
        roblox: {
            verifiedUsers: {},
            pendingVerifications: {}
        },
        games: {
            boom: {
                language: "tr",
                intervalSeconds: 60,
                reward: 100,
                channels: [],
                stats: {},
                errors: [],
                expectedNumber: 1,
                lastPlayerId: null,
                maxNumber: 20
            },
            word: {
                language: "tr",
                channelId: null,
                stats: {},
                rules: "Bot ilk kelimeyi yazacak. Sonraki kelime, önceki kelimenin son harfiyle başlamalı. Geçersiz, tekrar eden veya kurala uymayan kelimeler yanlış sayılır.",
                lastWord: null,
                lastPlayerId: null,
                usedWords: []
            }
        }
    };
}

function normalizeSettings(raw = {}) {
    const settings = defaultSettings();
    settings.panelChannelId = raw.panelChannelId || raw.panelChannel || null;
    settings.ticketCategoryId = raw.ticketCategoryId || raw.ticketCategory || null;
    settings.voicePanelCategoryId = raw.voicePanelCategoryId || null;
    const oldRoles = raw.supportRoles || {};
    for (const key of categoryKeys) {
        const legacyRole = raw[`${key}SupportRole`];
        const configuredRoles = oldRoles[key] || legacyRole || [];
        settings.supportRoles[key] = Array.isArray(configuredRoles) ? configuredRoles.filter(Boolean) : [configuredRoles];
    }

    for (const [ticketId, ticket] of Object.entries(raw.openTickets || {})) {
        if (ticket?.channelId && ticket?.ownerId && categoryKeys.includes(ticket.categoryKey)) {
            settings.openTickets[ticketId] = {
                channelId: ticket.channelId,
                ownerId: ticket.ownerId,
                categoryKey: ticket.categoryKey,
                createdAt: ticket.createdAt || Date.now(),
                status: ticket.status || "open"
            };
        }
    }
    settings.casino = { users: {} };
    for (const [userId, wallet] of Object.entries(raw.casino?.users || {})) {
        settings.casino.users[userId] = {
            balance: Number.isFinite(wallet?.balance) ? Math.max(0, Math.floor(wallet.balance)) : 1000,
            wins: Number.isFinite(wallet?.wins) ? wallet.wins : 0,
            losses: Number.isFinite(wallet?.losses) ? wallet.losses : 0
        };
    }
    const rawEconomy = raw.economy || {};
    settings.economy.startingBalance = Number.isFinite(rawEconomy.startingBalance) ? Math.max(0, Math.floor(rawEconomy.startingBalance)) : 1000;
    settings.economy.maximumBalance = Number.isFinite(rawEconomy.maximumBalance) ? Math.max(1, Math.floor(rawEconomy.maximumBalance)) : 1000000;
    settings.economy.moneyEmoji = typeof rawEconomy.moneyEmoji === "string" && rawEconomy.moneyEmoji.trim() ? rawEconomy.moneyEmoji.trim().slice(0, 100) : settings.economy.moneyEmoji;
    settings.economy.auditEnabled = rawEconomy.auditEnabled !== false;
    for (const [userId, wallet] of Object.entries(rawEconomy.users || {})) {
        settings.economy.users[userId] = {
            cash: Number.isFinite(wallet?.cash) ? Math.max(0, Math.floor(wallet.cash)) : settings.economy.startingBalance,
            bank: Number.isFinite(wallet?.bank) ? Math.max(0, Math.floor(wallet.bank)) : 0,
            items: wallet?.items && typeof wallet.items === "object" ? Object.fromEntries(Object.entries(wallet.items).filter(([itemId, count]) => Number.isFinite(count) && count > 0).map(([itemId, count]) => [itemId, Math.floor(count)])) : {},
            lastWork: Number.isFinite(wallet?.lastWork) ? wallet.lastWork : 0,
            lastRob: Number.isFinite(wallet?.lastRob) ? wallet.lastRob : 0,
            roleClaims: wallet?.roleClaims && typeof wallet.roleClaims === "object" ? wallet.roleClaims : {}
        };
    }
    for (const [roleId, income] of Object.entries(rawEconomy.roleIncome || {})) {
        if (Number.isFinite(income?.amount) && Number.isFinite(income?.intervalMs)) {
            settings.economy.roleIncome[roleId] = { amount: Math.max(0, Math.floor(income.amount)), intervalMs: Math.max(60000, Math.floor(income.intervalMs)) };
        }
    }
    for (const [itemId, item] of Object.entries(rawEconomy.items || {})) {
        if (!item || typeof item !== "object") continue;
        settings.economy.items[itemId] = {
            name: String(item.name || itemId).slice(0, 100),
            price: Number.isFinite(item.price) ? Math.max(0, Math.floor(item.price)) : 0,
            description: String(item.description || "").slice(0, 1000),
            icon: String(item.icon || "").slice(0, 100),
            buyable: item.buyable !== false,
            sellable: item.sellable !== false,
            buybackRate: Number.isFinite(item.buybackRate) ? Math.max(0, Math.min(1, item.buybackRate)) : 0.5,
            stock: item.stock === null ? null : Number.isFinite(item.stock) ? Math.max(0, Math.floor(item.stock)) : null,
            consumable: item.consumable !== false,
            roleId: item.roleId || null,
            action: item.action || null,
            actionValue: item.actionValue || null
        };
    }
    const rawRoblox = raw.roblox || {};
    for (const [discordId, verified] of Object.entries(rawRoblox.verifiedUsers || {})) {
        if (!verified?.userId || !verified?.username || !Number.isFinite(verified.rank)) continue;
        settings.roblox.verifiedUsers[discordId] = {
            userId: String(verified.userId),
            username: String(verified.username).slice(0, 100),
            roleId: verified.roleId ? String(verified.roleId) : null,
            roleName: String(verified.roleName || "").slice(0, 100),
            rank: Math.max(0, Math.floor(verified.rank)),
            verifiedAt: Number.isFinite(verified.verifiedAt) ? verified.verifiedAt : Date.now()
        };
    }
    for (const [discordId, pending] of Object.entries(rawRoblox.pendingVerifications || {})) {
        if (!pending?.userId || !pending?.username || !pending?.code || !Number.isFinite(pending.expiresAt)) continue;
        if (pending.expiresAt > Date.now()) {
            settings.roblox.pendingVerifications[discordId] = {
                userId: String(pending.userId),
                username: String(pending.username).slice(0, 100),
                code: String(pending.code).slice(0, 30),
                expiresAt: pending.expiresAt
            };
        }
    }
    const rawGames = raw.games || {};
    settings.games.boom.language = rawGames.boom?.language === "en" ? "en" : "tr";
    settings.games.boom.intervalSeconds = Number.isFinite(rawGames.boom?.intervalSeconds) ? Math.max(10, Math.min(86400, Math.floor(rawGames.boom.intervalSeconds))) : 60;
    settings.games.boom.reward = Number.isFinite(rawGames.boom?.reward) ? Math.max(0, Math.floor(rawGames.boom.reward)) : 100;
    settings.games.boom.channels = Array.isArray(rawGames.boom?.channels) ? rawGames.boom.channels.filter(Boolean) : [];
    settings.games.boom.stats = rawGames.boom?.stats && typeof rawGames.boom.stats === "object" ? rawGames.boom.stats : {};
    settings.games.boom.errors = Array.isArray(rawGames.boom?.errors) ? rawGames.boom.errors.slice(-50) : [];
    settings.games.boom.expectedNumber = Number.isFinite(rawGames.boom?.expectedNumber) ? Math.max(1, Math.floor(rawGames.boom.expectedNumber)) : 1;
    settings.games.boom.lastPlayerId = rawGames.boom?.lastPlayerId || null;
    settings.games.boom.maxNumber = Number.isFinite(rawGames.boom?.maxNumber) ? Math.max(1, Math.floor(rawGames.boom.maxNumber)) : 20;
    settings.games.word.language = rawGames.word?.language === "en" ? "en" : "tr";
    settings.games.word.channelId = rawGames.word?.channelId || null;
    settings.games.word.stats = rawGames.word?.stats && typeof rawGames.word.stats === "object" ? rawGames.word.stats : {};
    const normalizedWordRules = typeof rawGames.word?.rules === "string" && rawGames.word.rules ? rawGames.word.rules.slice(0, 1000) : settings.games.word.rules;
    settings.games.word.rules = normalizedWordRules.toLowerCase().includes("tdk") || normalizedWordRules.toLowerCase().includes("sözlük")
        ? "Tek bir kelime yaz. Sonraki kelime, önceki kelimenin son harfiyle başlamalı."
        : normalizedWordRules;
    settings.games.word.lastWord = typeof rawGames.word?.lastWord === "string" ? rawGames.word.lastWord : null;
    settings.games.word.lastPlayerId = rawGames.word?.lastPlayerId || null;
    settings.games.word.usedWords = Array.isArray(rawGames.word?.usedWords) ? rawGames.word.usedWords.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim().toLocaleLowerCase("tr-TR").slice(0, 60)).slice(-200) : [];
    return settings;
}

function readDatabase() {
    if (!fs.existsSync(databaseFile)) return {};
    try {
        return JSON.parse(fs.readFileSync(databaseFile, "utf8"));
    } catch (error) {
        throw new Error(`Veritabanı okunamadı: ${error.message}`);
    }
}
function writeDatabase(database) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
}
function getGuildSettings(guildId) {
    const database = readDatabase();
    const settings = normalizeSettings(database[guildId]);
    if (JSON.stringify(database[guildId] || {}) !== JSON.stringify(settings)) {
        database[guildId] = settings;
        writeDatabase(database);
    }
    return settings;
}
function saveGuildSettings(guildId, settings) {
    const database = readDatabase();
    const normalized = normalizeSettings(settings);
    database[guildId] = normalized;
    writeDatabase(database);
    return normalized;
}
function updateGuildSettings(guildId, updater) {
    return saveGuildSettings(guildId, updater(getGuildSettings(guildId)));
}

module.exports = { categoryKeys, getGuildSettings, saveGuildSettings, updateGuildSettings, normalizeSettings };
