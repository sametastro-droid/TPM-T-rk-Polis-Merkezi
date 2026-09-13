const { PermissionsBitField } = require("discord.js");

const COMMAND_PERMISSIONS = new Map([
    ["sustur", PermissionsBitField.Flags.ModerateMembers],
    ["susturma-kaldir", PermissionsBitField.Flags.ModerateMembers],
    ["sunucudan-at", PermissionsBitField.Flags.KickMembers],
    ["yasakla", PermissionsBitField.Flags.BanMembers],
    ["temizle", PermissionsBitField.Flags.ManageMessages],
    ["terfi", PermissionsBitField.Flags.ManageRoles],
    ["tenzil", PermissionsBitField.Flags.ManageRoles],
    ["roblox-bagla", PermissionsBitField.Flags.ManageGuild],
    ["roblox-dogrula", PermissionsBitField.Flags.ManageGuild]
]);

const LIMITED_COMMANDS = new Set(COMMAND_PERMISSIONS.keys());

function hasBotCommandAccess(interaction, commandName) {
    const permissions = interaction.memberPermissions ?? interaction.member?.permissions;

    if (!permissions) return false;

    if (permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }

    const requiredPermission = COMMAND_PERMISSIONS.get(commandName);

    if (!requiredPermission) {
        return false;
    }

    return permissions.has(requiredPermission);
}

async function requireBotCommandAccess(interaction, commandName) {
    if (hasBotCommandAccess(interaction, commandName)) {
        return true;
    }

    await interaction.editReply({
        content: "Bu komutu kullanmak için gerekli Discord yetkisine sahip değilsiniz."
    });

    return false;
}

module.exports = {
    COMMAND_PERMISSIONS,
    LIMITED_COMMANDS,
    hasBotCommandAccess,
    requireBotCommandAccess
};
