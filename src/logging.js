const { EmbedBuilder } = require("discord.js");

const LOG_CHANNELS = {
    rank: "1547556830912319590",
    ticket: "1547556857638559764",
    moderation: "1547556866383679570"
};

async function sendLog(guild, type, title, fields, color = 0x5865f2) {
    const channelId = LOG_CHANNELS[type];
    const channel = guild?.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(fields.map(field => ({ name: field.name, value: String(field.value).slice(0, 1024), inline: field.inline ?? true })))
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => undefined);
}

module.exports = { sendLog, LOG_CHANNELS };
