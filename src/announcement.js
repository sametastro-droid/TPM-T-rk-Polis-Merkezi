const {
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const announcementCommand = new SlashCommandBuilder()
    .setName("duyur")
    .setDescription("Seçilen kanala duyuru gönderir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addChannelOption(option => option
        .setName("kanal")
        .setDescription("Duyurunun gönderileceği kanal.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addStringOption(option => option
        .setName("mesaj")
        .setDescription("Duyuru mesajı.")
        .setMaxLength(2000)
        .setRequired(true))
    .addRoleOption(option => option
        .setName("rol")
        .setDescription("Duyuruda etiketlenecek rol.")
        .setRequired(false))
    .addAttachmentOption(option => option
        .setName("foto")
        .setDescription("Galeriden eklenecek görsel.")
        .setRequired(false));

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveRoleMentions(guild, message, selectedRole) {
    const roleIds = new Set(selectedRole ? [selectedRole.id] : []);
    let resolvedMessage = message;
    const roles = [...guild.roles.cache.values()]
        .filter(role => !role.managed && role.name !== "@everyone")
        .sort((first, second) => second.name.length - first.name.length);

    for (const role of roles) {
        const rolePattern = new RegExp(`@${escapeRegex(role.name)}(?=\\s|$)`, "gi");
        if (rolePattern.test(resolvedMessage)) {
            resolvedMessage = resolvedMessage.replace(rolePattern, `<@&${role.id}>`);
            roleIds.add(role.id);
        }
    }

    for (const roleId of resolvedMessage.matchAll(/<@&(\d+)>/g)) roleIds.add(roleId[1]);
    return { resolvedMessage, roleIds: [...roleIds] };
}

function resolveChannelMentions(guild, message) {
    let resolvedMessage = message;
    const channels = [...guild.channels.cache.values()]
        .filter(channel => channel.name)
        .sort((first, second) => second.name.length - first.name.length);
    for (const channel of channels) {
        const channelPattern = new RegExp(`#${escapeRegex(channel.name)}(?=\\s|$)`, "gi");
        resolvedMessage = resolvedMessage.replace(channelPattern, `<#${channel.id}>`);
    }
    return resolvedMessage;
}

async function handleAnnouncement(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Bu komut için Sunucuyu Yönet yetkisi gerekir.", flags: MessageFlags.Ephemeral });
        return;
    }

    const channel = interaction.options.getChannel("kanal");
    const role = interaction.options.getRole("rol");
    const message = interaction.options.getString("mesaj");
    const image = interaction.options.getAttachment("foto");
    const roleMentionMessage = resolveRoleMentions(interaction.guild, message, role);
    const resolvedMessage = resolveChannelMentions(interaction.guild, roleMentionMessage.resolvedMessage);
    const roleIds = roleMentionMessage.roleIds;

    if (!channel?.isTextBased() || channel.isDMBased()) {
        await interaction.reply({ content: "Geçerli bir yazı kanalı seçmelisin.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (image && !image.contentType?.startsWith("image/")) {
        await interaction.reply({ content: "`foto` seçeneğinde yalnızca görsel dosyası kullanılabilir.", flags: MessageFlags.Ephemeral });
        return;
    }

    const embed = new EmbedBuilder().setColor(0x2b2d31).setDescription(resolvedMessage).setTimestamp();
    if (image) embed.setImage(image.url);

    try {
        await channel.send({
            content: roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(" ") : undefined,
            embeds: [embed],
            allowedMentions: { roles: roleIds }
        });
        await interaction.reply({
            content: `Duyuru ${channel} kanalına gönderildi${role ? ` ve ${role} etiketlendi` : ""}.`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error("Duyuru gönderilemedi:", error);
        await interaction.reply({
            content: "Duyuru gönderilemedi. Botun seçilen kanalda mesaj gönderme ve embed kullanma yetkisini kontrol et.",
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = { commands: [announcementCommand.toJSON()], handleAnnouncement };
