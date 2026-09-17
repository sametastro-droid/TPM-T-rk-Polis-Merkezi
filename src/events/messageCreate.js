const TARGET_CHANNEL_ID = "1547556716449898576";
const SPECIAL_USER_ID = "300479713015758848";
const SPECIAL_USER_COOLDOWN_MS = 60 * 60 * 1000; // 1 saat
let specialUserLastGreeted = 0;

const AUTO_RESPONSES = [
    {
        triggers: ["sa", "s.a", "sa hq", "s.a. hq", "s.a.", "sa psm", "sa psm hq"],
        response: "Aleykümselam, hoş geldin!"
    },
    {
        triggers: ["merhaba", "mrhb", "merhabalar"],
        response: "Merhaba, hoş geldin!"
    },
    {
        triggers: ["selam", "slm", "selamlar"],
        response: "Selam, hoş geldin!"
    },
    {
        triggers: ["günaydın", "gunaydin", "günaydınlar"],
        response: "Günaydın, güzel bir gün dilerim!"
    },
    {
        triggers: ["iyi geceler", "ii geceler", "iyi geceler hq"],
        response: "İyi geceler, tatlı rüyalar!"
    },
    {
        triggers: ["iyi akşamlar", "iyi aksamlar"],
        response: "İyi akşamlar, hoş geldin!"
    },
    {
        triggers: ["hoş geldin", "hos geldin", "hg"],
        response: "Hoş bulduk, teşekkürler!"
    },
    {
        triggers: ["hoş bulduk", "hos bulduk", "hb"],
        response: "Safa getirdin!"
    }
];

module.exports = {
    async execute(message) {
        if (message.author.bot || message.channelId !== TARGET_CHANNEL_ID) return;

        const contentLower = message.content.trim().toLowerCase();

        // Özel Kullanıcı Kontrolü
        if (message.author.id === SPECIAL_USER_ID) {
            const now = Date.now();
            if (now - specialUserLastGreeted >= SPECIAL_USER_COOLDOWN_MS) {
                specialUserLastGreeted = now;
                await message.reply({ content: "En sevdigim adam gelmis", allowedMentions: { repliedUser: false } }).catch(() => undefined);
                return;
            }
        }

        // Normal Otomatik Cevaplar
        for (const item of AUTO_RESPONSES) {
            if (item.triggers.includes(contentLower)) {
                await message.reply({
                    content: `<@${message.author.id}> ${item.response}`,
                    allowedMentions: { users: [message.author.id] }
                }).catch(() => undefined);
                return;
            }
        }
    }
};
