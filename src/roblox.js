const crypto = require("node:crypto");
const {
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./database");

const GROUP_ID = process.env.ROBLOX_GROUP_ID || "702534805";
const AUTHORIZED_DISCORD_ROLES = (process.env.ROBLOX_AUTHORIZED_ROLE_IDS || "1547556322533449769,1547556251297255524")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
const VERIFICATION_TTL = 15 * 60 * 1000;

const commands = [
    new SlashCommandBuilder()
        .setName("roblox")
        .setDescription("Roblox hesabını doğrular.")
        .addSubcommandGroup(group => group
            .setName("dogrulama")
            .setDescription("Roblox hesabı doğrulama işlemleri.")
            .addSubcommand(sub => sub
                .setName("baslat")
                .setDescription("Roblox profil kodu doğrulamasını başlatır.")
                .addStringOption(option => option
                    .setName("kullanici")
                    .setDescription("Roblox kullanıcı adı.")
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName("kontrol")
                .setDescription("Profilindeki doğrulama kodunu kontrol eder."))
            .addSubcommand(sub => sub
                .setName("kaldir")
                .setDescription("Roblox hesabı bağlantını kaldırır.")))
        .addSubcommandGroup(group => group
            .setName("uye")
            .setDescription("Roblox grup üyelerini arar.")
            .addSubcommand(sub => sub
                .setName("ara")
                .setDescription("Roblox grubunda kullanıcı arar.")
                .addStringOption(option => option
                    .setName("kullanici")
                    .setDescription("Roblox kullanıcı adı.")
                    .setRequired(true))))
].map(command => command.toJSON());

for (const commandName of ["terfi", "tenzil"]) {
    commands.push(new SlashCommandBuilder()
        .setName(commandName)
        .setDescription(`Roblox kullanıcısına ${commandName} işlemi uygular.`)
        .addStringOption(option => option
            .setName("kullanici")
            .setDescription("Roblox kullanıcı adı.")
            .setRequired(true))
        .addStringOption(option => option
            .setName("rutbe")
            .setDescription("Hedef rütbe.")
            .setRequired(true)
            .setAutocomplete(true))
        .toJSON());
}

function hidden(content) {
    return { content, flags: MessageFlags.Ephemeral };
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Roblox API hatası: ${response.status}`);
    return response.json();
}

async function getUser(username) {
    const data = await requestJson("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });
    const user = data.data?.[0];
    return user ? { id: user.id, name: user.name } : null;
}

async function getProfile(userId) {
    return requestJson(`https://users.roblox.com/v1/users/${userId}`);
}

async function getRoles() {
    const data = await requestJson(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles`);
    return (data.roles || []).filter(role => role.rank > 0).sort((first, second) => first.rank - second.rank);
}

async function getUserRole(userId) {
    const data = await requestJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const group = (data.data || []).find(entry => String(entry.group.id) === String(GROUP_ID));
    return group ? { roleId: group.role.id, roleName: group.role.name, rank: group.role.rank } : null;
}

async function setRole(userId, roleId) {
    const endpoint = process.env.ROBLOX_ROLE_UPDATE_URL;
    const apiKey = process.env.ROBLOX_API_KEY;
    if (!endpoint && !apiKey) return { success: false, message: "Roblox rütbe API bağlantısı kurulmamış. ROBLOX_ROLE_UPDATE_URL ve ROBLOX_API_KEY ayarlanmalı." };
    if (!endpoint) return { success: false, message: "ROBLOX_ROLE_UPDATE_URL eksik. Rütbe değiştirecek API adresini ayarla." };
    if (!apiKey) return { success: false, message: "ROBLOX_API_KEY eksik. Roblox Open Cloud API anahtarını ayarla." };
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey
        },
        body: JSON.stringify({ groupId: GROUP_ID, userId, roleId })
    });
    if (!response.ok) return { success: false, message: `Roblox rütbe API hatası: ${response.status}` };
    return { success: true };
}

function settingsFor(guildId) {
    return getGuildSettings(guildId);
}

function isDiscordAuthorized(interaction) {
    return AUTHORIZED_DISCORD_ROLES.some(roleId => interaction.member?.roles?.cache?.has(roleId));
}

function roleLabel(role) {
    return `[${role.rank}] ${role.name}`;
}

async function roleAutocomplete(interaction) {
    const current = (interaction.options.getString("rutbe") || "").toLocaleLowerCase("tr-TR");
    try {
        const roles = await getRoles();
        await interaction.respond(roles
            .filter(role => roleLabel(role).toLocaleLowerCase("tr-TR").includes(current))
            .slice(0, 25)
            .map(role => ({ name: roleLabel(role), value: String(role.id) })));
    } catch (error) {
        console.error("Roblox rütbe otomatik tamamlama hatası:", error.message);
        await interaction.respond([]).catch(() => undefined);
    }
}

async function handleVerification(interaction) {
    const settings = settingsFor(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (subcommand === "baslat") {
        const username = interaction.options.getString("kullanici");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user = await getUser(username);
        if (!user) return interaction.editReply(`**${username}** adlı Roblox kullanıcısı bulunamadı.`);
        const code = `TPM-${crypto.randomInt(100000, 1000000)}`;
        settings.roblox.pendingVerifications[userId] = {
            userId: String(user.id),
            username: user.name,
            code,
            expiresAt: Date.now() + VERIFICATION_TTL
        };
        updateGuildSettings(interaction.guildId, () => settings);
        return interaction.editReply(`**${user.name}** hesabını doğrulamak için Roblox profil açıklamana şu kodu ekle:
\`${code}\`

Kodu ekledikten sonra **/roblox dogrulama kontrol** komutunu kullan. Kod 15 dakika geçerlidir.`);
    }

    if (subcommand === "kontrol") {
        const pending = settings.roblox.pendingVerifications[userId];
        if (!pending || pending.expiresAt < Date.now()) return interaction.reply(hidden("Aktif doğrulama isteğin yok. Önce /roblox dogrulama baslat kullan."));
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const profile = await getProfile(pending.userId);
        if (!String(profile.description || "").includes(pending.code)) {
            return interaction.editReply("Kod Roblox profil açıklamasında bulunamadı. Kodu ekleyip tekrar dene.");
        }
        const role = await getUserRole(pending.userId);
        if (!role) return interaction.editReply("Roblox hesabı bu grupta bulunmuyor.");
        settings.roblox.verifiedUsers[userId] = {
            userId: pending.userId,
            username: pending.username,
            roleId: String(role.roleId),
            roleName: role.roleName,
            rank: role.rank,
            verifiedAt: Date.now()
        };
        delete settings.roblox.pendingVerifications[userId];
        updateGuildSettings(interaction.guildId, () => settings);
        return interaction.editReply(`Roblox hesabın doğrulandı: **${pending.username}** | Rütbe: **${roleLabel(role)}**`);
    }

    delete settings.roblox.verifiedUsers[userId];
    delete settings.roblox.pendingVerifications[userId];
    updateGuildSettings(interaction.guildId, () => settings);
    await interaction.reply(hidden("Roblox hesabı bağlantın kaldırıldı."));
}

async function handleMemberSearch(interaction) {
    const username = interaction.options.getString("kullanici");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = await getUser(username);
    if (!user) return interaction.editReply(`**${username}** adlı Roblox kullanıcısı bulunamadı.`);
    const role = await getUserRole(user.id);
    if (!role) return interaction.editReply(`**${user.name}** kullanıcısı bu Roblox grubunda bulunmuyor.`);
    return interaction.editReply([
        `**${user.name}** grupta bulundu.`,
        `Kullanıcı ID: **${user.id}**`,
        `Rütbe: **${roleLabel(role)}**`,
        `Profil: https://www.roblox.com/users/${user.id}/profile`
    ].join("\n"));
}

async function handleRankChange(interaction) {
    if (!isDiscordAuthorized(interaction)) return interaction.reply(hidden("Bu komut için yetkili Discord rolün olmalı."));
    const settings = settingsFor(interaction.guildId);
    const actor = settings.roblox.verifiedUsers[interaction.user.id];
    if (!actor) return interaction.reply(hidden("Önce /roblox dogrulama baslat ve /roblox dogrulama kontrol ile hesabını doğrula."));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const actorRole = await getUserRole(actor.userId);
    if (!actorRole) return interaction.editReply("Doğrulanmış Roblox hesabın grupta bulunamadı.");
    const target = await getUser(interaction.options.getString("kullanici"));
    if (!target) return interaction.editReply("Roblox kullanıcısı bulunamadı.");
    if (String(target.id) === String(actor.userId)) return interaction.editReply("Kendi hesabına terfi veya tenzil veremezsin.");

    const roles = await getRoles();
    const targetRole = roles.find(role => String(role.id) === interaction.options.getString("rutbe"));
    if (!targetRole) return interaction.editReply("Geçersiz rütbe.");
    const currentRole = await getUserRole(target.id);
    if (!currentRole) return interaction.editReply("Hedef kullanıcı bu grupta bulunmuyor.");
    if (targetRole.rank >= actorRole.rank) return interaction.editReply("Kendi rütbene eşit veya üstündeki bir rütbeyi veremezsin.");

    const commandName = interaction.commandName;
    if (commandName === "terfi" && targetRole.rank <= currentRole.rank) return interaction.editReply("Terfi rütbesi mevcut rütbeden yüksek olmalı.");
    if (commandName === "tenzil" && targetRole.rank >= currentRole.rank) return interaction.editReply("Tenzil rütbesi mevcut rütbeden düşük olmalı.");

    const result = await setRole(target.id, targetRole.id);
    if (!result.success) return interaction.editReply(`Rütbe değiştirilemedi. ${result.message}`);
    return interaction.editReply(`**${target.name}** kullanıcısının rütbesi **${roleLabel(currentRole)}** → **${roleLabel(targetRole)}** olarak değiştirildi.`);
}

async function handleRoblox(interaction) {
    if (interaction.commandName === "roblox") {
        if (interaction.options.getSubcommandGroup(false) === "uye") return handleMemberSearch(interaction);
        return handleVerification(interaction);
    }
    return handleRankChange(interaction);
}

module.exports = { commands, handleRoblox, roleAutocomplete };
