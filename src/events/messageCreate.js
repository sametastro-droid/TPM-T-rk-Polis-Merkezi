const { Events } = require("discord.js");

const TARGET_CHANNEL_ID = "1547556716449898576";
const SPECIAL_USER_ID = "300479713015758848";
const ONE_HOUR_MS = 60 * 60 * 1000;

let lastSpecialUserResponseTime = 0;

const responses = {
    "sa": "Aleykümselam, hoş geldin!",
    "merhaba": "Merhaba!",
    "iyi akşamlar": "İyi akşamlar!",
    "iyi aksamlar": "İyi akşamlar!",
    "günaydın": "Yeni bir güne merhaba de🌅",
    "gunaydin": "Yeni bir güne merhaba de🌅"
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        const now = Date.now();

        // Özel kullanıcı kontrolü (Saat başı 1 kere, tagsız, mesaja yanıt vererek)
        if (message.author.id === SPECIAL_USER_ID) {
            if (now - lastSpecialUserResponseTime >= ONE_HOUR_MS) {
                lastSpecialUserResponseTime = now;
                await message.reply({
                    content: "en sevdigim adam gelmis",
                    allowedMentions: { repliedUser: false }
                });
                return;
            }
        }

        const content = message.content.toLowerCase().trim();

        // Genel otomatik cevaplar (Her yazıldığında tag atarak)
        if (responses[content]) {
            await message.reply({
                content: responses[content],
                allowedMentions: { repliedUser: true }
            });
        }
    }
};
