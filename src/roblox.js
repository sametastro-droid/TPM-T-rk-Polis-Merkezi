const crypto = require("node:crypto");
const {
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./database");
const { sendLog } = require("./logging");

const GROUP_ID = "702534805";
const ROBLOX_API_URL = "https://groups.roblox.com";
const AUTHORIZED_DISCORD_ROLES = [
    "1547556322533449769",
    "1547556251297255524"
];
const MIN_MANAGED_RANK = 15;
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
            .setRequired(true)
            .setAutocomplete(true))
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
    const data = await requestJson(`${ROBLOX_API_URL}/v1/groups/${GROUP_ID}/roles`);
    return (data.roles || []).filter(role => role.rank > 0).sort((first, second) => first.rank - second.rank);
}

async function getGroupMembers(keyword) {
    if (!keyword || keyword.trim().length < 2) return [];
    const user = await getUser(keyword.trim());
    if (!user || !(await getUserRole(user.id))) return [];
    return [user];
}

async function getUserById(userId) {
    const data = await requestJson(`https://users.roblox.com/v1/users/${userId}`);
    return data?.id ? { id: data.id, name: data.name } : null;
}

async function getUserRole(userId) {
    const data = await requestJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const group = (data.data || []).find(entry => String(entry.group.id) === String(GROUP_ID));
    return group ? { roleId: group.role.id, roleName: group.role.name, rank: group.role.rank } : null;
}

async function setRole(userId, roleId) {
    const cookie = process.env.ROBLOX_COOKIE?.trim();
    if (!cookie) return { success: false, message: "ROBLOX_COOKIE yerel .env dosyasında ayarlanmadı." };
    const cookieHeader = cookie.startsWith(".ROBLOSECURITY=") ? cookie : `.ROBLOSECURITY=${cookie}`;
    const endpoint = `${ROBLOX_API_URL}/v1/groups/${GROUP_ID}/users/${userId}`;
    const headers = { "Content-Type": "application/json", Cookie: cookieHeader };
    let response = await fetch(endpoint, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ roleId })
    });
    const csrfToken = response.headers.get("x-csrf-token");
    if (response.status === 403 && csrfToken) {
        response = await fetch(endpoint, {
            method: "PATCH",
            headers: { ...headers, "x-csrf-token": csrfToken },
            body: JSON.stringify({ roleId })
        });
    }
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
    return role.name;
}

async function roleAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const current = String(focused.value || "").toLocaleLowerCase("tr-TR");
    try {
        if (focused.name === "kullanici") {
            const members = await getGroupMembers(String(focused.value || ""));
            await interaction.respond(members.slice(0, 25).map(member => ({ name: member.name, value: `user:${member.id}` })));
            return;
        }

        const roles = await getRoles();
        const settings = settingsFor(interaction.guildId);
        const verified = settings.roblox.verifiedUsers[interaction.user.id];
        
        // İşlemi yapan yetkilinin rütbe sınırı
        const actorMaxRank = verified?.rank ?? 0;

        const targetInput = interaction.options.getString("kullanici");
        let targetRole = null;
        if (targetInput) {
            const targetValue = targetInput.replace(/^user:/, "");
            const target = /^\d+$/.test(targetValue) ? await getUserById(targetValue) : await getUser(targetValue);
            if (target) targetRole = await getUserRole(target.id);
        }

        const commandName = interaction.commandName;

        const availableRoles = roles
            // 1. Yetkilinin kendi rütbesinden DÜŞÜK rütbeler gösterilir
            .filter(role => role.rank < actorMaxRank)
            // 2. Terfi/Tenzil mantığına göre hedef kullanıcının rütbesiyle kıyaslanır
            .filter(role => {
                if (!targetRole) return true;
                if (commandName === "terfi") {
                    return role.rank > targetRole.rank;
                } else {
                    return role.rank < targetRole.rank;
                }
            })
            // 3. İsim arama filtresi
            .filter(role => roleLabel(role).toLocaleLowerCase("tr-TR").includes(current))
            // 4. Terfi ise küçükten büyüğe, tenzil ise büyükten küçüğe sırala
            .sort((first, second) => commandName === "terfi" ? first.rank - second.rank : second.rank - first.rank)
            .slice(0, 25);

        await interaction.respond(availableRoles.map(role => ({ name: `${roleLabel(role)} (rütbe ${role.rank})`.slice(0, 100), value: `role:${role.id}` })));
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
    const targetInput = interaction.options.getString("kullanici");
    const targetValue = targetInput.replace(/^user:/, "");
    const target = /^\d+$/.test(targetValue) ? await getUserById(targetValue) : await getUser(targetValue);
    if (!target) return interaction.editReply("Roblox kullanıcısı bulunamadı.");
    if (String(target.id) === String(actor.userId)) return interaction.editReply("Kendi hesabına terfi veya tenzil veremezsin.");

    const currentRole = await getUserRole(target.id);
    if (!currentRole) return interaction.editReply("Hedef kullanıcı bu grupta bulunmuyor.");

    // Yetkili kendisiyle aynı veya kendisinden üst rütbedeki birisine işlem yapamaz
    if (currentRole.rank >= actorRole.rank) {
        return interaction.editReply("Kendi rütbene eşit veya senden üstte olan bir kullanıcıya terfi/tenzil işlemi uygulayamazsın.");
    }

    const roles = await getRoles();
    const targetRoleId = interaction.options.getString("rutbe").replace(/^role:/, "");
    const targetRole = roles.find(role => String(role.id) === targetRoleId);
    if (!targetRole) return interaction.editReply("Geçersiz rütbe.");

    if (targetRole.rank >= actorRole.rank) {
        return interaction.editReply("Kendi rütbene eşit veya üstündeki bir rütbeyi veremezsin.");
    }

    const commandName = interaction.commandName;
    const isPromotion = commandName === "terfi";

    const result = await setRole(target.id, targetRole.id);
    if (!result.success) return interaction.editReply(`Rütbe değiştirilemedi. ${result.message}`);
    await sendLog(interaction.guild, "rank", `${isPromotion ? "Terfi" : "Tenzil"} işlemi`, [
        { name: "İşlemi yapan", value: `${interaction.user} (${interaction.user.tag})` },
        { name: "Rütbe alan", value: `${target.name} (${target.id})` },
        { name: "Yetkilinin mevcut rütbesi", value: `${roleLabel(actorRole)} (${actorRole.rank})` },
        { name: "Eski rütbe", value: `${roleLabel(currentRole)} (${currentRole.rank})` },
        { name: "Yeni rütbe", value: `${roleLabel(targetRole)} (${targetRole.rank})` }
    ], isPromotion ? 0x2ecc71 : 0xe67e22);
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
