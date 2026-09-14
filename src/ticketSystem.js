const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder
} = require("discord.js");
const { categoryKeys, getGuildSettings, saveGuildSettings, updateGuildSettings } = require("./database");
const { sendLog } = require("./logging");

const PANEL_IMAGE_URL = "https://cdn.discordapp.com/attachments/1547556640817938463/1548627516590129242/IMG_3745_1.jpg?ex=6aa7bf44&is=6aa66dc4&hm=681e00096461a8e377a29ac0c3330484b4d46826f706347003deb93ae95c8ba8&";
const categories = {
    discord: { label: "Discord Destek", description: "Discord sunucularımızla ilgili destek.", slug: "discord" },
    oyunIci: { label: "Oyun Destek", description: "Oyunlarımızda yaşanan sorunlar veya yardımlar.", slug: "oyun" },
    gamepass: { label: "Gamepass Destek Talebi", description: "Transfer işlemleri ile ilgili talepler.", slug: "gamepass" },
    transfer: { label: "Transfer Talebi", description: "Transfer işlemleri ile ilgili talepler.", slug: "transfer" }
};
const setupStates = new Map();

function setupKey(interaction) { return `${interaction.guildId}:${interaction.user.id}`; }
function setupSummary(state) {
    return [
        "**DESTEK SİSTEMİ KURULUMU**",
        `Panel kanalı: <#${state.panelChannelId}>`,
        `Ticket kategorisi: <#${state.ticketCategoryId}>`,
        ...categoryKeys.map(key => `${categories[key].label}: ${state.supportRoles[key].map(roleId => `<@&${roleId}>`).join(", ") || "Seçilmedi"}`)
    ].join("\n");
}
function setupSelectors(state) {
    const selectors = [];
    if (!state.panelChannelId) selectors.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("support-setup:panel").setPlaceholder("Panel kanalı seçin").setChannelTypes(ChannelType.GuildText)));
    if (!state.ticketCategoryId) selectors.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("support-setup:category").setPlaceholder("Ticket kategorisi seçin").setChannelTypes(ChannelType.GuildCategory)));
    for (const key of categoryKeys) {
        if (!state.supportRoles[key]?.length) selectors.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`support-setup:role:${key}`).setPlaceholder(`${categories[key].label} rollerini seçin`).setMinValues(1).setMaxValues(10)));
    }
    return selectors.slice(0, 5);
}
function setupComplete(state) {
    return Boolean(state.panelChannelId && state.ticketCategoryId && categoryKeys.every(key => state.supportRoles[key]?.length));
}
function confirmationButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("support-setup:confirm").setLabel("Kurulumu Tamamla").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("support-setup:cancel").setLabel("İptal").setStyle(ButtonStyle.Secondary)
    );
}

async function openSetup(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Bu komutu kullanmak için Sunucuyu Yönet yetkisi gerekir.", flags: MessageFlags.Ephemeral });
        return;
    }
    const current = getGuildSettings(interaction.guildId);
    const state = {
        panelChannelId: null,
        ticketCategoryId: null,
        supportRoles: Object.fromEntries(categoryKeys.map(key => [key, []])),
        openTickets: { ...current.openTickets }
    };
    setupStates.set(setupKey(interaction), state);
    await interaction.reply({ content: "Kurulum seçeneklerini belirleyin.", components: setupComplete(state) ? [confirmationButtons()] : setupSelectors(state), flags: MessageFlags.Ephemeral });
}

async function handleSetupSelect(interaction) {
    const state = setupStates.get(setupKey(interaction));
    if (!state) return interaction.reply({ content: "Kurulum oturumunun süresi doldu. /destek kur komutunu yeniden kullanın.", flags: MessageFlags.Ephemeral });
    if (interaction.customId === "support-setup:panel") state.panelChannelId = interaction.values[0];
    else if (interaction.customId === "support-setup:category") state.ticketCategoryId = interaction.values[0];
    else state.supportRoles[interaction.customId.split(":")[2]] = [...interaction.values];
    setupStates.set(setupKey(interaction), state);
    if (setupComplete(state)) await interaction.update({ content: setupSummary(state), components: [confirmationButtons()] });
    else await interaction.update({ content: `Kurulum seçeneklerini belirleyin.\n\n${setupSummary(state)}`, components: setupSelectors(state) });
}

async function handleSetupButton(interaction) {
    const state = setupStates.get(setupKey(interaction));
    if (!state) return interaction.update({ content: "Kurulum oturumunun süresi doldu.", components: [] });
    if (interaction.customId === "support-setup:cancel") {
        setupStates.delete(setupKey(interaction));
        return interaction.update({ content: "Kurulum iptal edildi.", components: [] });
    }
    const saved = saveGuildSettings(interaction.guildId, state);
    const panelChannel = interaction.guild.channels.cache.get(saved.panelChannelId);
    if (!panelChannel?.isTextBased()) return interaction.update({ content: "Panel kanalı bulunamadı.", components: [] });
    await sendSupportPanel(panelChannel);
    setupStates.delete(setupKey(interaction));
    await interaction.update({ content: `${setupSummary(saved)}\n\nDestek paneli seçilen kanala gönderildi.`, components: [] });
}

function panelMenu() {
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("support-category").setPlaceholder("Destek kategorisi seçin").addOptions(Object.entries(categories).map(([value, category]) => ({ label: category.label, description: category.description, value }))));
}
async function sendSupportPanel(channel) {
    const text = new EmbedBuilder().setColor(0x2b2d31).setTitle("TPM | Türk Polis Merkezi | Destek").setDescription([
        "Merhaba! Destek sistemine hoş geldin.",
        "",
        "**📜 Talimatlar:**",
        "Aşağıdaki listeden ihtiyacına uygun kategoriyi seç.",
        "",
        "<:Destek:1547657947453194362> Discord Destek → Discord sunucularımız ile ilgili sorunlar.",
        "<:roblox:1547659794943447060> Oyun Destek → Oyunlarımızda yaşanan sorunlar veya yardımlar.",
        "<:robux:1547721896752189461> Gamepass Destek Talebi → Transfer işlemleri ile ilgili talepler.",
        "<:eemspolis:1547659364276641802> Transfer Talebi → Transfer işlemleri ile ilgili talepler.",
        "",
        "------------------------------------------------------",
        "",
        "**📌 Transferlerimiz**",
        "En fazla 1.SEM YK+ onay alırsa EGM'ye kadar çıkmaktadır",
        "",
        "-# TPM | Teşkilat Yönetimi"
    ].join("\n")).setThumbnail(PANEL_IMAGE_URL);
    await channel.send({ embeds: [text], components: [panelMenu()] });
}
function categoryRoleIds(guild, categoryKey) { return getGuildSettings(guild.id).supportRoles[categoryKey] || []; }
function ticketOverwrites(guild, ownerId, roleIds) {
    return [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        ...roleIds.map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }))
    ];
}
function ticketButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Bileti Kapat").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket:info").setLabel("Bilet Bilgileri").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket:user").setLabel("Kullanıcı Bilgileri").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket:delete").setLabel("Bileti Sil").setStyle(ButtonStyle.Danger)
    );
}
function confirmationButtonsFor(action) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket:${action}-confirm`).setLabel(action === "close" ? "Kapat" : "Bileti Sil").setStyle(action === "close" ? ButtonStyle.Secondary : ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket:${action}-cancel`).setLabel("Vazgeç").setStyle(ButtonStyle.Secondary)
    );
}
function ticketRecord(interaction) { return Object.values(getGuildSettings(interaction.guildId).openTickets).find(ticket => ticket.channelId === interaction.channelId); }
function isAuthorized(interaction, record) { return interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) || categoryRoleIds(interaction.guild, record.categoryKey).some(roleId => interaction.member.roles.cache.has(roleId)); }

async function createTicket(interaction) {
    const categoryKey = interaction.values[0];
    const category = categories[categoryKey];
    const settings = getGuildSettings(interaction.guildId);
    const existing = Object.values(settings.openTickets).find(ticket => ticket.ownerId === interaction.user.id && ticket.status === "open");
    if (existing) {
        const existingChannel = interaction.guild.channels.cache.get(existing.channelId);
        await interaction.reply({ content: existingChannel ? `Açık biletiniz: ${existingChannel}` : "Zaten açık bir biletiniz bulunuyor.", flags: MessageFlags.Ephemeral });
        return;
    }
    const roleIds = categoryRoleIds(interaction.guild, categoryKey);
    const channel = await interaction.guild.channels.create({ name: `destek-${interaction.user.id}-${category.slug}`, type: ChannelType.GuildText, parent: settings.ticketCategoryId, topic: `owner:${interaction.user.id};category:${categoryKey}`, permissionOverwrites: ticketOverwrites(interaction.guild, interaction.user.id, roleIds), reason: "Destek bileti oluşturuldu" });
    const createdAt = Date.now();
    updateGuildSettings(interaction.guildId, current => ({ ...current, openTickets: { ...current.openTickets, [channel.id]: { channelId: channel.id, ownerId: interaction.user.id, categoryKey, createdAt, status: "open" } } }));
    const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle("TPM | Türk Polis Merkezi | Destek").setDescription("Yeni destek talebi oluşturuldu.\n\nLütfen talebinizi mümkün olduğunca ayrıntılı şekilde açıklayın. İlgili destek ekibi sizinle ilgilenecektir.").addFields(
        { name: "Bilet Sahibi", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Discord ID", value: interaction.user.id, inline: true },
        { name: "Destek Kategorisi", value: category.label, inline: true },
        { name: "Durum", value: "Açık", inline: true },
        { name: "Oluşturulma Tarihi", value: `<t:${Math.floor(createdAt / 1000)}:F>`, inline: true }
    );
    await channel.send({ content: roleIds.map(roleId => `<@&${roleId}>`).join(" "), embeds: [embed], components: [ticketButtons()], allowedMentions: { roles: roleIds, users: [interaction.user.id] } });
    await interaction.reply({ content: `Biletiniz oluşturuldu: ${channel}`, flags: MessageFlags.Ephemeral });
    await sendLog(interaction.guild, "ticket", "Bilet açıldı", [
        { name: "Bileti açan", value: `${interaction.user} (${interaction.user.tag})` },
        { name: "Bilet sahibi", value: `<@${interaction.user.id}>` },
        { name: "Kategori", value: category.label },
        { name: "Kanal", value: `${channel} (${channel.id})` }
    ], 0x2ecc71);
}

async function userInformation(interaction, record) {
    const member = await interaction.guild.members.fetch(record.ownerId);
    const roles = member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.name).join(", ") || "Yok";
    await interaction.reply({ content: `Kullanıcı: <@${member.id}>\nDiscord ID: ${member.id}\nSunucuya katılma tarihi: <t:${Math.floor(member.joinedTimestamp / 1000)}:F>\nHesap oluşturulma tarihi: <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>\nRoller: ${roles}`, flags: MessageFlags.Ephemeral });
}

async function handleTicketButton(interaction) {
    const record = ticketRecord(interaction);
    if (!record) return interaction.reply({ content: "Bu biletin veritabanı kaydı bulunamadı.", flags: MessageFlags.Ephemeral });
    const action = interaction.customId.split(":")[1];
    const owner = record.ownerId === interaction.user.id;
    const authorized = isAuthorized(interaction, record);
    if (action === "delete" && !authorized) return interaction.reply({ content: "Bileti silmek için destek rolü veya uygun yönetim yetkisi gerekir.", flags: MessageFlags.Ephemeral });
    if (["close", "info", "user"].includes(action) && !authorized && !owner) return interaction.reply({ content: "Bu işlem için yetkiniz yok.", flags: MessageFlags.Ephemeral });
    if (action === "close") return interaction.reply({ content: "Bileti kapatmak istediğinize emin misiniz?", components: [confirmationButtonsFor("close")], flags: MessageFlags.Ephemeral });
    if (action === "delete") return interaction.reply({ content: "Bileti kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.", components: [confirmationButtonsFor("delete")], flags: MessageFlags.Ephemeral });
    if (action === "info") return interaction.reply({ content: `Bilet Sahibi: <@${record.ownerId}>\nDiscord ID: ${record.ownerId}\nDestek Kategorisi: ${categories[record.categoryKey].label}\nOluşturulma Tarihi: <t:${Math.floor(record.createdAt / 1000)}:F>\nDurum: ${record.status}\nKanal ID: ${interaction.channelId}`, flags: MessageFlags.Ephemeral });
    if (action === "user") return userInformation(interaction, record);
    if (action.endsWith("-cancel")) return interaction.update({ content: "İşlem iptal edildi.", components: [] });
    if (action === "close-confirm") {
        await interaction.channel.permissionOverwrites.edit(record.ownerId, { SendMessages: false });
        updateGuildSettings(interaction.guildId, current => ({ ...current, openTickets: { ...current.openTickets, [interaction.channelId]: { ...record, status: "closed" } } }));
        await sendLog(interaction.guild, "ticket", "Bilet kapatıldı", [
            { name: "Kapatan", value: `${interaction.user} (${interaction.user.tag})` },
            { name: "Bilet sahibi", value: `<@${record.ownerId}>` },
            { name: "Kategori", value: categories[record.categoryKey].label },
            { name: "Kanal ID", value: interaction.channelId }
        ], 0xe67e22);
        return interaction.update({ content: "Bilet kapatıldı.", components: [] });
    }
    if (action === "delete-confirm") {
        updateGuildSettings(interaction.guildId, current => { const openTickets = { ...current.openTickets }; delete openTickets[interaction.channelId]; return { ...current, openTickets }; });
        await sendLog(interaction.guild, "ticket", "Bilet silindi", [
            { name: "Silen", value: `${interaction.user} (${interaction.user.tag})` },
            { name: "Bilet sahibi", value: `<@${record.ownerId}>` },
            { name: "Kategori", value: categories[record.categoryKey].label },
            { name: "Kanal ID", value: interaction.channelId }
        ], 0xe74c3c);
        await interaction.update({ content: "Bilet siliniyor.", components: [] });
        await interaction.channel.delete("Bilet silindi");
    }
}

module.exports = { openSetup, handleSetupSelect, handleSetupButton, sendSupportPanel, createTicket, handleTicketButton, categories, PANEL_IMAGE_URL };
