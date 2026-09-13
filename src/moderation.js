const {
    AttachmentBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const durations = {
    "1 saat": 60 * 60 * 1000,
    "2 saat": 2 * 60 * 60 * 1000,
    "5 saat": 5 * 60 * 60 * 1000,
    "10 saat": 10 * 60 * 60 * 1000,
    "1 gün": 24 * 60 * 60 * 1000,
    "1 hafta": 7 * 24 * 60 * 60 * 1000
};

const durationChoices = Object.keys(durations).map(value => ({ name: value, value }));
const banDurationChoices = [...durationChoices, { name: "Kalıcı", value: "kalici" }];

function evidenceOption(builder) {
    return builder.addAttachmentOption(option => option.setName("kanit").setDescription("İşlem kanıtı").setRequired(false));
}
function reasonOption(builder) {
    return builder.addStringOption(option => option.setName("sebep").setDescription("İşlem sebebi").setRequired(true).setMaxLength(500));
}
function userOption(builder) {
    return builder.addUserOption(option => option.setName("kullanici").setDescription("İşlem yapılacak kullanıcı").setRequired(true));
}
function durationOption(builder, choices) {
    return builder.addStringOption(option => option.setName("sure").setDescription("İşlem süresi").setRequired(true).addChoices(...choices));
}

const commandBuilders = [
    reasonOption(durationOption(userOption(new SlashCommandBuilder().setName("yasakla").setDescription("Bir kullanıcıyı sunucudan yasaklar")), banDurationChoices)),
    evidenceOption(reasonOption(userOption(new SlashCommandBuilder().setName("sunucudan-at").setDescription("Bir kullanıcıyı sunucudan çıkarır")))),
    evidenceOption(reasonOption(new SlashCommandBuilder().setName("yasak-kaldir").setDescription("Bir kullanıcının sunucu yasağını kaldırır").addStringOption(option => option.setName("kullanici-id").setDescription("Kullanıcı ID").setRequired(true)))),
    evidenceOption(reasonOption(durationOption(userOption(new SlashCommandBuilder().setName("sustur").setDescription("Bir kullanıcıyı susturur")), durationChoices))),
    evidenceOption(reasonOption(userOption(new SlashCommandBuilder().setName("susturma-kaldir").setDescription("Kullanıcının susturmasını kaldırır")))),
    evidenceOption(reasonOption(durationOption(userOption(new SlashCommandBuilder().setName("kalici-yasakla").setDescription("Kullanıcıyı işlem yapılabilen sunucularda yasaklar")), banDurationChoices))),
    new SlashCommandBuilder().setName("temizle").setDescription("Kanaldaki mesajları siler").addIntegerOption(option => option.setName("adet").setDescription("Silinecek mesaj sayısı").setRequired(true).setMinValue(1).setMaxValue(500)),
    new SlashCommandBuilder().setName("rolleri-ters-cevir").setDescription("Sunucudaki rolleri ters sıraya çevirir"),
    new SlashCommandBuilder().setName("toplu-ban-affi").setDescription("Sunucudaki tüm banları kaldırır")
];

const commands = commandBuilders.map(command => command.toJSON());

function parseDuration(value) {
    return value === "kalici" ? null : durations[value];
}
function mentionEvidence(attachment) {
    return attachment ? ` Kanıt: ${attachment.url}` : "";
}
function getReason(interaction) {
    return `${interaction.options.getString("sebep")} | İşlemi yapan: ${interaction.user.tag}`;
}
async function getTarget(interaction) {
    const target = interaction.options.getUser("kullanici");
    return target || interaction.client.users.fetch(interaction.options.getString("kullanici-id"));
}
function scheduleUnban(guild, userId, duration, reason) {
    if (!duration) return;
    setTimeout(() => guild.bans.remove(userId, `Süre doldu: ${reason}`).catch(() => undefined), duration);
}
async function banEverywhere(client, userId, reason, duration) {
    const results = { success: 0, failed: 0 };
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.ban(userId, { reason });
            scheduleUnban(guild, userId, duration, reason);
            results.success += 1;
        } catch {
            results.failed += 1;
        }
    }
    return results;
}
async function requirePermission(interaction, permission) {
    if (interaction.memberPermissions.has(permission)) return true;
    await interaction.reply({ content: "Bu işlem için gerekli Discord yetkisine sahip değilsiniz.", flags: MessageFlags.Ephemeral });
    return false;
}

async function handleModeration(interaction) {
    const name = interaction.commandName;
    const attachment = interaction.options.getAttachment("kanit");
    const reason = `${getReason(interaction)}${mentionEvidence(attachment)}`;

    if (["yasakla", "yasak-kaldir", "kalici-yasakla"].includes(name)) {
        if (!(await requirePermission(interaction, PermissionFlagsBits.BanMembers))) return;
    } else if (["sunucudan-at"].includes(name)) {
        if (!(await requirePermission(interaction, PermissionFlagsBits.KickMembers))) return;
    } else if (["sustur", "susturma-kaldir"].includes(name)) {
        if (!(await requirePermission(interaction, PermissionFlagsBits.ModerateMembers))) return;
    } else if (name === "temizle") {
        if (!(await requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;
    } else if (["rolleri-ters-cevir", "toplu-ban-affi"].includes(name)) {
        if (!(await requirePermission(interaction, PermissionFlagsBits.ManageGuild))) return;
    }

    if (name === "yasakla" || name === "kalici-yasakla") {
        const target = await getTarget(interaction);
        const duration = parseDuration(interaction.options.getString("sure"));
        const result = name === "kalici-yasakla"
            ? await banEverywhere(interaction.client, target.id, reason, duration)
            : await banEverywhere({ guilds: new Map([[interaction.guildId, interaction.guild]]) }, target.id, reason, duration);
        await interaction.reply({ content: `${target.tag} için ${result.success} sunucuda yasaklama uygulandı.${result.failed ? ` ${result.failed} sunucuda uygulanamadı.` : ""}` });
        return;
    }

    if (name === "yasak-kaldir") {
        const targetId = interaction.options.getString("kullanici-id");
        await interaction.guild.bans.remove(targetId, reason);
        await interaction.reply({ content: `${targetId} kullanıcısının yasağı kaldırıldı.` });
        return;
    }

    if (name === "sunucudan-at") {
        const target = await getTarget(interaction);
        await interaction.guild.members.kick(target.id, reason);
        await interaction.reply({ content: `${target.tag} sunucudan çıkarıldı.` });
        return;
    }

    if (name === "sustur") {
        const target = await getTarget(interaction);
        await interaction.guild.members.timeout(target.id, parseDuration(interaction.options.getString("sure")), reason);
        await interaction.reply({ content: `${target.tag} susturuldu.` });
        return;
    }

    if (name === "susturma-kaldir") {
        const target = await getTarget(interaction);
        await interaction.guild.members.timeout(target.id, null, reason);
        await interaction.reply({ content: `${target.tag} kullanıcısının susturması kaldırıldı.` });
        return;
    }

    if (name === "temizle") {
        const messages = await interaction.channel.bulkDelete(interaction.options.getInteger("adet"), true);
        await interaction.reply({ content: `${messages.size} mesaj silindi.`, flags: MessageFlags.Ephemeral });
        return;
    }

    if (name === "rolleri-ters-cevir") {
        const roles = interaction.guild.roles.cache.filter(role => !role.managed && role.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
        const ordered = [...roles.values()];
        for (let index = 0; index < ordered.length; index += 1) {
            await ordered[index].setPosition(ordered.length - index, { reason: "Roller ters çevrildi" });
        }
        await interaction.reply({ content: "Roller ters sıraya çevrildi." });
        return;
    }

    if (name === "toplu-ban-affi") {
        const bans = await interaction.guild.bans.fetch();
        let removed = 0;
        for (const ban of bans.values()) {
            await interaction.guild.bans.remove(ban.user.id, reason).then(() => { removed += 1; }).catch(() => undefined);
        }
        await interaction.reply({ content: `${removed} yasağın kaldırılması tamamlandı.` });
    }
}

module.exports = { commands, handleModeration };
