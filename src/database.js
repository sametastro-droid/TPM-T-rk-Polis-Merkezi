const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || path.join(__dirname, "../data"));
const databaseFile = path.join(dataDirectory, "guild-settings.json");
const categoryKeys = ["transfer", "gamepass", "discord", "oyunIci"];

function asRoleIdArray(value) {
	const values = Array.isArray(value) ? value : value ? [value] : [];
	return [...new Set(values.flatMap(item => String(item).split(/[\s,]+/))
		.map(item => item.replace(/[^0-9]/g, "")).filter(Boolean))];
}

function defaultSettings() {
	return {
		supportRoles: { transfer: [], gamepass: [], discord: [], oyunIci: [] }
	};
}

function firstDefined(...values) {
	return values.find(value => value !== undefined && value !== null);
}

function normalizeSettings(raw = {}) {
	const settings = defaultSettings();
	const rawSupportRoles = raw.supportRoles || {};

	settings.supportRoles.transfer = asRoleIdArray(firstDefined(rawSupportRoles.transfer, raw.transferSupportRoles, raw.transferSupportRole, raw.transferRoleId));
	settings.supportRoles.gamepass = asRoleIdArray(firstDefined(rawSupportRoles.gamepass, raw.gamepassSupportRoles, raw.gamepassSupportRole, raw.gamepassRoleId));
	settings.supportRoles.discord = asRoleIdArray(firstDefined(rawSupportRoles.discord, raw.discordSupportRoles, raw.discordSupportRole, raw.discordRoleId));
	settings.supportRoles.oyunIci = asRoleIdArray(firstDefined(rawSupportRoles.oyunIci, raw.oyunIciSupportRoles, raw.oyunIciSupportRole, raw.oyunIciRoleId, raw.oyunDestekRole));
	return settings;
}

function readDatabase() {
	if (!fs.existsSync(databaseFile)) return {};
	return JSON.parse(fs.readFileSync(databaseFile, "utf8"));
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

function memberHasConfiguredRole(member, roleIds) {
	return roleIds.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
	categoryKeys,
	getGuildSettings,
	saveGuildSettings,
	normalizeSettings,
	asRoleIdArray,
	memberHasConfiguredRole
};

