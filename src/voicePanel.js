const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} = require("discord.js");

const { getGuildSettings, updateGuildSettings } = require("./database");

const command = new (require("discord.js").SlashCommandBuilder)()
    .setName("ses-panel")
    .setDescription("Özel ses kanalı yönetim paneli gönderir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString())
    .addChannelOption(option => option
        .setName("kanal")
        .setDescription("Panelin gönderileceği yazı kanalı.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addChannelOption(option => option
        .setName("kategori")
        .setDescription("Özel ses kanallarının oluşturulacağı kategori.")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false));

const buttons = [
    ["voice:create", "Kanal oluştur", ButtonStyle.Success],
    ["voice:rename", "Yeniden adlandır", ButtonStyle.Primary],
    ["voice:delete", "Sil", ButtonStyle.Danger],
    ["voice:add-user", "Kullanıcı ekle", ButtonStyle.Secondary],
    ["voice:remove-user", "Kullanıcı çıkar", ButtonStyle.Secondary],
    ["voice:lock", "Kilitle", ButtonStyle.Secondary],
    ["voice:unlock", "Kilidi kaldır", ButtonStyle.Secondary],
    ["voice:count", "Üye sayısı", ButtonStyle.Secondary],
    ["voice:kick", "Kanaldan at", ButtonStyle.Danger],
    ["voice:info", "Kanal bilgisi", ButtonStyle.Secondary],
    ["voice:add-role", "Rol ekle", ButtonStyle.Secondary],
    ["voice:remove-role", "Rol çıkar", ButtonStyle.Secondary]
];

function panelRows() {
    const rows = [];
    for (let index = 0; index < buttons.length; index += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5).map(([id, label, style]) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style))));
    }
    return rows;
}

function panelEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Ses Sistemi Paneli")
        .setDescription([
            "Butonlara basarak özel ses kanalını yönetebilirsin.",
            "",
            "**Buton Açıklamaları:**",
            "**Kanal oluştur**: Yeni bir ses kanalı oluşturur.",
            "**Yeniden adlandır**: Kanalın adını değiştirir.",
            "**Sil**: Kanalı tamamen kaldırır.",
            "**Kullanıcı ekle / çıkar**: Kullanıcı erişimini yönetir.",
            "**Kilitle / Kilidi kaldır**: Kanala girişleri açar veya kapatır.",
            "**Üye sayısı**: Kanaldaki kullanıcı sayısını gösterir.",
            "**Kanaldan at**: Kullanıcıyı sesten çıkarır.",
            "**Kanal bilgisi**: Kanal detaylarını gösterir.",
            "**Rol ekle / çıkar**: Kanala özel rol erişimi verir veya kaldırır."
        ].join("\n"));
}

function ownerId(channel) {
    const ownerOverwrite = channel.permissionOverwrites?.cache.find(overwrite => overwrite.type === 1 && overwrite.allow.has(PermissionFlagsBits.ManageChannels));
    return ownerOverwrite?.id || null;
}
function isVoiceChannel(channel) { return channel?.type === ChannelType.GuildVoice; }
function isManager(interaction, channel) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) || ownerId(channel) === interaction.user.id;
}
function ephemeral(content) { return { content, flags: MessageFlags.Ephemeral }; }
function voiceChannelFromInteraction(interaction) {
    const voiceState = interaction.guild.voiceStates.cache.get(interaction.user.id);
    const currentChannel = voiceState?.channelId ? interaction.guild.channels.cache.get(voiceState.channelId) : null;
    if (isVoiceChannel(currentChannel)) return currentChannel;
    return interaction.guild.channels.cache.find(channel => isVoiceChannel(channel) && ownerId(channel) === interaction.user.id && channel.members.has(interaction.user.id));
}
function selectedVoiceChannel(interaction) {
    return interaction.guild.channels.cache.get(interaction.values?.[0]) || interaction.member.voice.channel;
}
function modal(customId, title, label, value = "") {
    const input = new TextInputBuilder().setCustomId("value").setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(value);
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
}

async function sendPanel(interaction) {
    const channel = interaction.options.getChannel("kanal");
    const category = interaction.options.getChannel("kategori");
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply(ephemeral("Bu komut için Kanal Yönet yetkisi gerekir."));
        return;
    }
    if (!channel?.isTextBased() || channel.isDMBased()) {
        await interaction.reply(ephemeral("Geçerli bir yazı kanalı seçmelisin."));
        return;
    }
    updateGuildSettings(interaction.guildId, current => ({ ...current, voicePanelCategoryId: category?.id || current.voicePanelCategoryId || null }));
    await channel.send({ embeds: [panelEmbed()], components: panelRows() });
    await interaction.reply(ephemeral(`Ses paneli ${channel} kanalına gönderildi.`));
}

async function createVoiceChannel(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const settings = getGuildSettings(interaction.guildId);
        const category = interaction.guild.channels.cache.get(settings.voicePanelCategoryId);
        const channel = await interaction.guild.channels.create({
            name: `${interaction.user.username}-oda`.slice(0, 100),
            type: ChannelType.GuildVoice,
            parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.ManageChannels] }
            ],
            reason: "Özel ses kanalı oluşturuldu"
        });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member.voice.channel) await member.voice.setChannel(channel).catch(() => undefined);
        setTimeout(async () => {
            const freshChannel = interaction.guild.channels.cache.get(channel.id);
            if (freshChannel && isVoiceChannel(freshChannel) && freshChannel.members.size === 0) {
                await freshChannel.delete("Özel ses kanalına 5 dakika içinde girilmedi").catch(() => undefined);
            }
        }, 5 * 60 * 1000);
        await interaction.editReply({ content: `Özel ses kanalın oluşturuldu: ${channel}` });
    } catch (error) {
        console.error("Özel ses kanalı oluşturulamadı:", error);
        await interaction.editReply({ content: "Ses kanalı oluşturulamadı. Botta Kanal Yönet ve Kanalları Görme yetkilerini kontrol et." }).catch(() => undefined);
    }
}

async function handleButton(interaction) {
    const action = interaction.customId.split(":")[1];
    if (action === "create") return createVoiceChannel(interaction);
    const channel = voiceChannelFromInteraction(interaction);
    if (!channel) { await interaction.reply(ephemeral("Önce kendi özel ses kanalında bulunmalısın.")); return; }
    if (!isManager(interaction, channel)) { await interaction.reply(ephemeral("Bu kanalın sahibi veya Kanal Yönet yetkisine sahip olmalısın.")); return; }
    if (action === "rename") return interaction.showModal(modal("voice:rename-modal", "Kanalı yeniden adlandır", "Yeni kanal adı", channel.name));
    if (action === "add-user") return interaction.reply({ content: "Kanala eklenecek kullanıcıyı seç:", components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("voice:add-user-select").setPlaceholder("Kullanıcı seç"))], flags: MessageFlags.Ephemeral });
    if (action === "remove-user") return interaction.reply({ content: "Kanaldan çıkarılacak kullanıcıyı seç:", components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("voice:remove-user-select").setPlaceholder("Kullanıcı seç"))], flags: MessageFlags.Ephemeral });
    if (action === "add-role") return interaction.reply({ content: "Kanala eklenecek rolü seç:", components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("voice:add-role-select").setPlaceholder("Rol seç"))], flags: MessageFlags.Ephemeral });
    if (action === "remove-role") return interaction.reply({ content: "Kanaldan çıkarılacak rolü seç:", components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("voice:remove-role-select").setPlaceholder("Rol seç"))], flags: MessageFlags.Ephemeral });
    if (action === "lock" || action === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: action === "lock" ? false : null });
        await interaction.reply(ephemeral(action === "lock" ? "Ses kanalı kilitlendi." : "Ses kanalının kilidi kaldırıldı."));
        return;
    }
    if (action === "count") { await interaction.reply(ephemeral(`Kanaldaki üye sayısı: ${channel.members.size}`)); return; }
    if (action === "info") { await interaction.reply(ephemeral(`Kanal: ${channel}\nSahip: <@${ownerId(channel)}>\nÜye sayısı: ${channel.members.size}\nKilitli: ${channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.Connect) ? "Evet" : "Hayır"}`)); return; }
    if (action === "kick") return interaction.reply({ content: "Sesten atılacak kullanıcıyı seç:", components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("voice:kick-select").setPlaceholder("Kullanıcı seç"))], flags: MessageFlags.Ephemeral });
    if (action === "delete") { await channel.delete("Özel ses kanalı silindi"); await interaction.reply(ephemeral("Özel ses kanalı silindi.")); }
}

async function handleSelect(interaction) {
    const channel = voiceChannelFromInteraction(interaction);
    if (!channel || !isManager(interaction, channel)) { await interaction.reply(ephemeral("Bu kanalın sahibi veya Kanal Yönet yetkisine sahip olmalısın.")); return; }
    const target = interaction.values[0];
    if (interaction.customId === "voice:add-user-select") await channel.permissionOverwrites.edit(target, { ViewChannel: true, Connect: true, Speak: true, Stream: true });
    if (interaction.customId === "voice:remove-user-select") await channel.permissionOverwrites.edit(target, { ViewChannel: false, Connect: false });
    if (interaction.customId === "voice:kick-select") { const member = channel.members.get(target); if (member) await member.voice.disconnect("Ses panelinden çıkarıldı"); }
    if (interaction.customId === "voice:add-role-select") await channel.permissionOverwrites.edit(target, { ViewChannel: true, Connect: true, Speak: true, Stream: true });
    if (interaction.customId === "voice:remove-role-select") await channel.permissionOverwrites.delete(target);
    await interaction.update({ content: "Ses kanalı güncellendi.", components: [] });
}

async function handleModal(interaction) {
    if (interaction.customId !== "voice:rename-modal") return;
    const channel = voiceChannelFromInteraction(interaction);
    if (!channel || !isManager(interaction, channel)) { await interaction.reply(ephemeral("Ses kanalını yönetme yetkin yok.")); return; }
    await channel.setName(interaction.fields.getTextInputValue("value").trim(), "Ses panelinden yeniden adlandırıldı");
    await interaction.reply(ephemeral(`Kanal adı **${channel.name}** olarak değiştirildi.`));
}

module.exports = { commands: [command.toJSON()], sendPanel, handleButton, handleSelect, handleModal };
