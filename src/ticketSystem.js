const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const { getGuildSettings, saveGuildSettings, memberHasConfiguredRole } = require("./database");

const PANEL_IMAGE_URL = "https://cdn.discordapp.com/attachments/1547317243292024882/1547547333032419369/IMG_3745.jpg?ex=6aa3d144&is=6aa27fc4&hm=1689547befecaec7bf7d9c675c1aab31ad532b7612548306991d9fdc93cd768b&";
const PANEL_LOGO_URL = "https://media.discordapp.net/attachments/1547556716449898576/1547661886680600576/IMG_3745.jpg?ex=6aa787b3&is=6aa63633&hm=e9cea9310267c604fb0f9519ddf5dbb78521fe85f792da6c5d40a24b918d72c6&=";

const categories = {
    transfer: { label: "🎟️ Transfer Destek", description: "Transfer işlemleri ile ilgili talepler.", slug: "transfer" },
    gamepass: { label: "🛒 Gamepass Destek", description: "Gamepass işlemleri ile ilgili talepler.", slug: "gamepass" },
    discord: { label: "🛠️ Discord Destek", description: "Discord sunucularımız ile ilgili sorunlar.", slug: "discord" },
    oyunIci: { label: "Oyun İçi Destek", description: "Oyunlarımızda yaşanan sorunlar veya yardımlar.", slug: "oyun-ici" }
};

function roleMentions(roleIds) {
    return roleIds.map(roleId => `<@&${roleId}>`).join(" ");
}

function parseRoleIds(value, guild) {
    const candidates = String(value || "").split(/[\s,]+/)
        .map(item => item.replace(/[^0-9]/g, "")).filter(Boolean);
    const roleIds = [...new Set(candidates)].filter(roleId => guild.roles.cache.has(roleId));
    const invalidRoleIds = [...new Set(candidates)].filter(roleId => !guild.roles.cache.has(roleId));
    return { roleIds, invalidRoleIds };
}

function textInput(customId, label) {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setPlaceholder("Rol ID veya @rol mentionlarını virgülle ayırın")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(1000);
}

function setupModal() {
    return new ModalBuilder()
        .setCustomId("support-config")
        .setTitle("Destek Rolleri")
        .addComponents(
            new ActionRowBuilder().addComponents(textInput("transfer", "🎟️ Transfer Destek Rolleri")),
            new ActionRowBuilder().addComponents(textInput("gamepass", "🛒 Gamepass Destek Rolleri")),
            new ActionRowBuilder().addComponents(textInput("discord", "🛠️ Discord Destek Rolleri")),
            new ActionRowBuilder().addComponents(textInput("oyunIci", "Oyun İçi Destek Rolleri"))
        );
}

async function openSetupModal(interaction) {
    await interaction.showModal(setupModal());
}

async function saveSetupModal(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const supportRoles = {};
    const invalidRoleIds = [];

    for (const key of Object.keys(categories)) {
        const result = parseRoleIds(interaction.fields.getTextInputValue(key), interaction.guild);
        supportRoles[key] = result.roleIds;
        invalidRoleIds.push(...result.invalidRoleIds);
    }

    if (invalidRoleIds.length) {
        await interaction.reply({
            content: `Şu rol ID'leri bu sunucuda bulunamadı: ${[...new Set(invalidRoleIds)].join(", ")}`,
            ephemeral: true
        });
        return;
    }

    const saved = saveGuildSettings(interaction.guildId, { ...settings, supportRoles });
    const summary = Object.entries(categories).map(([key, category]) => {
        return `**${category.label}**\n${roleMentions(saved.supportRoles[key]) || "Rol ayarlanmadı."}`;
    }).join("\n\n");

    await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle("Destek rolleri güncellendi").setDescription(summary)],
        ephemeral: true
    });
}

function categoryMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("support-category")
            .setPlaceholder("Destek kategorisi seçin")
            .addOptions(Object.entries(categories).map(([value, category]) => ({
                label: category.label,
                description: category.description,
                value
            })))
    );
}

async function sendSupportPanel(interaction) {
    const panelImage = new EmbedBuilder().setImage(PANEL_IMAGE_URL);
    const panel = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("** | TPM | Türk Polis Merkezi | Destek")
        .setThumbnail(PANEL_LOGO_URL)
        .setDescription("Destek talebi açmak için aşağıdaki menüden bir kategori seçin. Her kullanıcı için aynı anda bir açık ticket bulunabilir.\nTicket oluşturulduğunda yalnızca siz ve ilgili yetkili ekip kanalı görebilir.");
    const information = new EmbedBuilder().setColor(0x2b2d31).setDescription(
        "Merhaba! Destek sistemine hoş geldin.\n\n" +
        "**📜 Talimatlar:**\nAşağıdaki listeden ihtiyacına uygun kategoriyi seç.\n\n" +
        "<:Destek:1547657947453194362> Discord Destek → Discord sunucularımız ile ilgili sorunlar.\n" +
        "<:roblox:1547659794943447060> Oyun Destek → Oyunlarımızda yaşanan sorunlar veya yardımlar.\n" +
        "<:robux:1547721896752189461> Gamepass Destek Talebi → Transfer işlemleri ile ilgili talepler.\n" +
        "<:eemspolis:1547659364276641802> Transfer Talebi → Transfer işlemleri ile ilgili talepler.\n\n" +
        "**📌 Transferlerimiz**\nEn fazla 1.SEM YK+ onay alırsa EGM'ye kadar çıkmaktadır\n\n" +
        "-# TPM | Teşkilat Yönetimi"
    );

    await interaction.reply({ embeds: [panelImage, panel, information], components: [categoryMenu()] });
}

function getCategoryRoleIds(guild, categoryKey) {
    return getGuildSettings(guild.id).supportRoles[categoryKey]
        .filter(roleId => guild.roles.cache.has(roleId));
}

function ticketOverwrites(guild, userId, roleIds) {
    return [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: userId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        },
        ...roleIds.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        }))
    ];
}

function ticketButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Ticketi Kapat").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket:delete").setLabel("Ticketi Sil").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket:info").setLabel("Ticket Bilgisi").setStyle(ButtonStyle.Primary)
    );
}

function topicValue(topic, key) {
    return topic?.match(new RegExp(`${key}:([^;]+)`))?.[1];
}

function canManageTicket(interaction, roleIds) {
    return topicValue(interaction.channel.topic, "owner") === interaction.user.id
        || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
        || memberHasConfiguredRole(interaction.member, roleIds);
}

async function createTicket(interaction) {
    const categoryKey = interaction.values[0];
    const category = categories[categoryKey];
    const existingTicket = interaction.guild.channels.cache.find(channel =>
        channel.name.startsWith(`destek-${interaction.user.id}-`));

    if (existingTicket) {
        await interaction.reply({ content: `Zaten açık bir ticketınız var: ${existingTicket}`, ephemeral: true });
        return;
    }

    const roleIds = getCategoryRoleIds(interaction.guild, categoryKey);
    const channelOptions = {
        name: `destek-${interaction.user.id}-${category.slug}`,
        type: ChannelType.GuildText,
        topic: `owner:${interaction.user.id};category:${categoryKey}`,
        permissionOverwrites: ticketOverwrites(interaction.guild, interaction.user.id, roleIds),
        reason: "Destek ticketı oluşturuldu"
    };

    if (process.env.TICKET_CATEGORY_ID) channelOptions.parent = process.env.TICKET_CATEGORY_ID;

    const channel = await interaction.guild.channels.create(channelOptions);
    const ticketEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("Yeni destek talebi oluşturuldu")
        .addFields(
            { name: "Bilet Sahibi", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Discord ID", value: interaction.user.id, inline: true },
            { name: "Destek Kategorisi", value: category.label, inline: true },
            { name: "Durum", value: "Açık", inline: true },
            { name: "Oluşturulma Tarihi", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setDescription("Lütfen talebinizi mümkün olduğunca ayrıntılı şekilde açıklayın. İlgili destek ekibi sizinle ilgilenecektir.");

    await channel.send({
        content: `${roleMentions(roleIds)}\n\nYeni destek talebi oluşturuldu.`.trim(),
        embeds: [ticketEmbed],
        components: [ticketButtons()],
        allowedMentions: { roles: roleIds, users: [interaction.user.id] }
    });
    await interaction.reply({ content: `Ticketınız oluşturuldu: ${channel}`, ephemeral: true });
}

async function handleTicketButton(interaction) {
    const categoryKey = topicValue(interaction.channel.topic, "category");
    const roleIds = categoryKey ? getCategoryRoleIds(interaction.guild, categoryKey) : [];

    if (!canManageTicket(interaction, roleIds)) {
        await interaction.reply({ content: "Bu ticket üzerinde işlem yapma yetkiniz yok.", ephemeral: true });
        return;
    }

    const action = interaction.customId.split(":")[1];
    if (action === "info") {
        await interaction.reply({
            content: `Ticket sahibi: <@${topicValue(interaction.channel.topic, "owner") || "bilinmiyor"}>\nKanal: ${interaction.channel.name}`,
            ephemeral: true
        });
        return;
    }

    if (action === "close") {
        const ownerId = topicValue(interaction.channel.topic, "owner");
        if (ownerId) await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: false });
        await interaction.channel.setName(`kapali-${interaction.channel.name.replace(/^destek-/, "")}`);
        await interaction.reply({ content: "Ticket kapatıldı." });
        return;
    }

    await interaction.reply({ content: "Ticket siliniyor." });
    await interaction.channel.delete("Ticket silindi");
}

function isWhitelisted(member, guildId) {
    return memberHasConfiguredRole(member, getGuildSettings(guildId).whitelistRoleIds);
}

function isVanderlinde(member, guildId) {
    return memberHasConfiguredRole(member, getGuildSettings(guildId).vanderlindeRoleIds);
}

module.exports = {
    openSetupModal,
    saveSetupModal,
    sendSupportPanel,
    createTicket,
    handleTicketButton,
    isWhitelisted,
    isVanderlinde,
    categories,
    PANEL_IMAGE_URL,
    PANEL_LOGO_URL
};
