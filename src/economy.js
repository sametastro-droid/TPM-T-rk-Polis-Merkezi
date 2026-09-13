const crypto = require("node:crypto");
const {
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./database");

const ECONOMY_CHANNEL_ID = "1547556728072175616";
const WORK_COOLDOWN = 60 * 60 * 1000;
const ROB_COOLDOWN = 30 * 60 * 1000;
const adminPermission = PermissionFlagsBits.ManageGuild.toString();

function integerOption(option, name, description, required = true, min = 1, max = 1000000000) {
    return option.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required);
}
function userOption(option, name = "kullanici", required = true) { return option.setName(name).setDescription("İşlem yapılacak kullanıcı.").setRequired(required); }
function itemOption(option, required = true) { return option.setName("urun").setDescription("Ürün adı.").setRequired(required); }

const economyCommand = new SlashCommandBuilder().setName("ekonomi").setDescription("Ekonomi hesabını yönetir.")
    .addSubcommand(sub => sub.setName("baslangic-bakiye").setDescription("Yeni kullanıcıların başlangıç nakit bakiyesini ayarlar.").addIntegerOption(o => integerOption(o, "miktar", "Başlangıç bakiyesi.")))
    .addSubcommand(sub => sub.setName("cek").setDescription("Bankadan nakit çeker.").addIntegerOption(o => integerOption(o, "miktar", "Çekilecek miktar.")))
    .addSubcommand(sub => sub.setName("cikar").setDescription("Kullanıcının parasını azaltır.").addUserOption(o => userOption(o)).addIntegerOption(o => integerOption(o, "miktar", "Çıkarılacak miktar.")))
    .addSubcommand(sub => sub.setName("denetim-kaydi").setDescription("Ekonomi denetim kaydını açar veya kapatır.").addStringOption(o => o.setName("durum").setDescription("Denetim durumu.").addChoices({ name: "Aç", value: "acik" }, { name: "Kapat", value: "kapali" }).setRequired(true)))
    .addSubcommand(sub => sub.setName("ekle").setDescription("Kullanıcıya para ekler.").addUserOption(o => userOption(o)).addIntegerOption(o => integerOption(o, "miktar", "Eklenecek miktar.")))
    .addSubcommand(sub => sub.setName("gonder").setDescription("Başka kullanıcıya nakit gönderir.").addUserOption(o => userOption(o)).addIntegerOption(o => integerOption(o, "miktar", "Gönderilecek miktar.")))
    .addSubcommand(sub => sub.setName("herkese-banka-ekle").setDescription("Tüm kullanıcılara banka bakiyesi ekler.").addIntegerOption(o => integerOption(o, "miktar", "Eklenecek banka miktarı.")))
    .addSubcommand(sub => sub.setName("maksimum-bakiye").setDescription("Nakit ve banka toplam limitini ayarlar.").addIntegerOption(o => integerOption(o, "miktar", "Maksimum toplam bakiye.", true, 1, 2000000000)))
    .addSubcommand(sub => sub.setName("para").setDescription("Bir kullanıcının bakiyesini gösterir.").addUserOption(o => userOption(o, "kullanici", false)))
    .addSubcommand(sub => sub.setName("para-simgesi").setDescription("Ekonomi para simgesini değiştirir.").addStringOption(o => o.setName("simge").setDescription("Emoji veya para simgesi.").setMaxLength(100).setRequired(true)))
    .addSubcommand(sub => sub.setName("siralama").setDescription("En zengin kullanıcıları gösterir."))
    .addSubcommand(sub => sub.setName("tumunu-sifirla").setDescription("Tüm bakiyeleri ve envanterleri sıfırlar.").addStringOption(o => o.setName("onay").setDescription("Sıfırlamayı onayla.").addChoices({ name: "Evet, sıfırla", value: "evet" }).setRequired(true)))
    .addSubcommand(sub => sub.setName("yatir").setDescription("Nakit parayı bankaya yatırır.").addIntegerOption(o => integerOption(o, "miktar", "Yatırılacak miktar.")));

const incomeCommand = new SlashCommandBuilder().setName("gelir").setDescription("Gelir ve para kazanma işlemlerini yönetir.")
    .addSubcommand(sub => sub.setName("calis").setDescription("Çalışarak para kazanır."))
    .addSubcommandGroup(group => group.setName("rol-gelir").setDescription("Rol gelirlerini yönetir.").addSubcommand(sub => sub.setName("ekle").setDescription("Bir role zamanlı gelir ekler.").addRoleOption(o => o.setName("rol").setDescription("Gelir alacak rol.").setRequired(true)).addIntegerOption(o => integerOption(o, "miktar", "Her ödemede verilecek miktar.")).addIntegerOption(o => integerOption(o, "dakika", "Ödeme aralığı (dakika).", true, 1, 43200))).addSubcommand(sub => sub.setName("kaldir").setDescription("Bir rolün gelirini kaldırır.").addRoleOption(o => o.setName("rol").setDescription("Geliri kaldırılacak rol.").setRequired(true))).addSubcommand(sub => sub.setName("liste").setDescription("Rol gelirlerini listeler.")))
    .addSubcommand(sub => sub.setName("soygun").setDescription("Belirtilen kullanıcıyı soyar.").addUserOption(o => userOption(o)))
    .addSubcommand(sub => sub.setName("suc").setDescription("Suç işleyerek para kazanır."))
    .addSubcommand(sub => sub.setName("topla").setDescription("Rol gelirlerini toplar."));

const itemCommand = new SlashCommandBuilder().setName("itemler").setDescription("Mağaza ve item yönetimi.")
    .addSubcommand(sub => sub.setName("olustur").setDescription("Mağazaya yeni ürün ekler.").addStringOption(o => itemOption(o)).addIntegerOption(o => integerOption(o, "fiyat", "Ürün fiyatı.", true, 0, 2000000000)).addStringOption(o => o.setName("aciklama").setDescription("Ürün açıklaması.").setMaxLength(1000).setRequired(false)).addStringOption(o => o.setName("ikon").setDescription("Ürün ikonu.").setMaxLength(100).setRequired(false)))
    .addSubcommandGroup(group => group.setName("aksiyon").setDescription("Item aksiyonlarını yönetir.").addSubcommand(sub => sub.setName("ekle").setDescription("Iteme kullanım aksiyonu ekler.").addStringOption(o => itemOption(o)).addStringOption(o => o.setName("aksiyon").setDescription("Item kullanıldığında yapılacak işlem.").addChoices({ name: "Bakiye düzenle", value: "bakiye-duzenle" }, { name: "Rol düzenle", value: "rol-duzenle" }, { name: "Mesaj gönder", value: "mesaj-gonder" }, { name: "Ürün düzenle", value: "urun-duzenle" }, { name: "JSON verisi", value: "json" }).setRequired(true)).addStringOption(o => o.setName("deger").setDescription("Aksiyon değeri.").setMaxLength(1000).setRequired(true))).addSubcommand(sub => sub.setName("kaldir").setDescription("Item aksiyonunu kaldırır.").addStringOption(o => itemOption(o))))
    .addSubcommand(sub => sub.setName("duzenle").setDescription("Mağaza ürününü düzenler.").addStringOption(o => itemOption(o)).addStringOption(o => o.setName("alan").setDescription("Düzenlenecek alan.").addChoices({ name: "Fiyat", value: "fiyat" }, { name: "Açıklama", value: "aciklama" }, { name: "İkon", value: "ikon" }, { name: "Satılabilir", value: "satilabilir" }, { name: "Geri alım oranı", value: "geri-alim-orani" }, { name: "Stok", value: "stok" }, { name: "Tüketilebilir", value: "tuketilebilir" }).setRequired(true)).addStringOption(o => o.setName("deger").setDescription("Yeni değer.").setMaxLength(1000).setRequired(true)))
    .addSubcommand(sub => sub.setName("liste").setDescription("Mağaza ürünlerini listeler."))
    .addSubcommand(sub => sub.setName("satin-al").setDescription("Mağazadan ürün satın alır.").addStringOption(o => itemOption(o)).addIntegerOption(o => integerOption(o, "adet", "Satın alınacak adet.", true, 1, 100)))
    .addSubcommand(sub => sub.setName("kullan").setDescription("Envanterindeki ürünü kullanır.").addStringOption(o => itemOption(o)));

const itemManageCommand = new SlashCommandBuilder().setName("item").setDescription("Envanter item işlemleri.")
    .addSubcommand(sub => sub.setName("sil").setDescription("Belirtilen itemi envanterden siler.").addStringOption(o => itemOption(o)))
    .addSubcommand(sub => sub.setName("envanter").setDescription("Kendi envanterini gösterir."));

const commands = [economyCommand, incomeCommand, itemCommand, itemManageCommand].map(command => command.toJSON());

function random(max) { return crypto.randomInt(0, max); }
function data(guildId) { return getGuildSettings(guildId); }
function wallet(settings, userId) {
    if (!settings.economy.users[userId]) settings.economy.users[userId] = { cash: settings.economy.startingBalance, bank: 0, items: {}, lastWork: 0, lastRob: 0, roleClaims: {} };
    return settings.economy.users[userId];
}
function total(userWallet) { return userWallet.cash + userWallet.bank; }
function money(settings, amount) { return `${Math.max(0, Math.floor(amount)).toLocaleString("tr-TR")} ${settings.economy.moneyEmoji}`; }
function hidden(content, extra = {}) { return { content, flags: MessageFlags.Ephemeral, ...extra }; }
function isAdmin(interaction) { return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild); }
async function adminOnly(interaction) { if (isAdmin(interaction)) return true; await interaction.reply(hidden("Bu işlem yalnızca yöneticiler tarafından kullanılabilir.")); return false; }
function withinLimit(settings, userWallet) { return total(userWallet) <= settings.economy.maximumBalance; }
function findItem(settings, name) { const key = name.toLowerCase(); return Object.entries(settings.economy.items).find(([id, item]) => id.toLowerCase() === key || item.name.toLowerCase() === key); }
async function logAction(interaction, title, description, color = 0x5865f2) {
    return;
}
async function channelOnly(interaction) {
    if (interaction.channelId === ECONOMY_CHANNEL_ID) return true;
    await interaction.reply(hidden(`Ekonomi komutları yalnızca <#${ECONOMY_CHANNEL_ID}> kanalında kullanılabilir.`));
    return false;
}
function setBalance(settings, userWallet, field, amount) {
    userWallet[field] = Math.max(0, Math.floor(amount));
    if (!withinLimit(settings, userWallet)) userWallet[field] = Math.max(0, settings.economy.maximumBalance - (field === "cash" ? userWallet.bank : userWallet.cash));
}
function addCash(settings, userWallet, amount) { setBalance(settings, userWallet, "cash", userWallet.cash + amount); }
function resetUserWallet(settings, userId) { settings.economy.users[userId] = { cash: settings.economy.startingBalance, bank: 0, items: {}, lastWork: 0, lastRob: 0, roleClaims: {} }; }
function parseBoolean(value) { return ["true", "evet", "1", "acik"].includes(String(value).toLowerCase()); }

async function handleEconomy(interaction) {
    if (!(await channelOnly(interaction))) return;
    const settings = data(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    const current = wallet(settings, interaction.user.id);
    if (["baslangic-bakiye", "cikar", "denetim-kaydi", "ekle", "herkese-banka-ekle", "maksimum-bakiye", "para-simgesi", "tumunu-sifirla"].includes(sub) && !(await adminOnly(interaction))) return;
    if (sub === "baslangic-bakiye") { settings.economy.startingBalance = interaction.options.getInteger("miktar"); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Başlangıç bakiyesi değişti", `${interaction.user} yeni kullanıcı başlangıç bakiyesini ${money(settings, settings.economy.startingBalance)} yaptı.`); await interaction.reply(hidden("Başlangıç bakiyesi güncellendi.")); return; }
    if (sub === "cek" || sub === "yatir") { const amount = interaction.options.getInteger("miktar"); if (sub === "cek" && current.bank < amount) return interaction.reply(hidden("Bankada yeterli paran yok.")); if (sub === "yatir" && current.cash < amount) return interaction.reply(hidden("Nakit bakiyende yeterli para yok.")); if (sub === "cek") { current.bank -= amount; addCash(settings, current, amount); } else { current.cash -= amount; current.bank += amount; } updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, sub === "cek" ? "Bankadan para çekildi" : "Bankaya para yatırıldı", `${interaction.user} ${money(settings, amount)} işlem yaptı.`); await interaction.reply(hidden(`İşlem tamamlandı. Nakit: ${money(settings, current.cash)} | Banka: ${money(settings, current.bank)}`)); return; }
    if (sub === "cikar") { const target = interaction.options.getUser("kullanici"); const amount = interaction.options.getInteger("miktar"); const targetWallet = wallet(settings, target.id); const removed = Math.min(amount, total(targetWallet)); targetWallet.cash = Math.max(0, targetWallet.cash - removed); if (removed < amount) targetWallet.bank = Math.max(0, targetWallet.bank - (amount - removed)); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Kullanıcıdan para çıkarıldı", `${target} hesabından ${money(settings, removed)} çıkarıldı.`); await interaction.reply(hidden(`${target} hesabından ${money(settings, removed)} çıkarıldı.`)); return; }
    if (sub === "denetim-kaydi") { settings.economy.auditEnabled = interaction.options.getString("durum") === "acik"; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`Ekonomi denetim kaydı ${settings.economy.auditEnabled ? "açıldı" : "kapatıldı"}.`)); return; }
    if (sub === "ekle") { const target = interaction.options.getUser("kullanici"); const amount = interaction.options.getInteger("miktar"); const targetWallet = wallet(settings, target.id); addCash(settings, targetWallet, amount); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Kullanıcıya para eklendi", `${target} hesabına ${money(settings, amount)} eklendi.`); await interaction.reply(hidden(`${target} hesabına ${money(settings, amount)} nakit eklendi.`)); return; }
    if (sub === "gonder") { const target = interaction.options.getUser("kullanici"); const amount = interaction.options.getInteger("miktar"); if (target.bot || target.id === interaction.user.id) return interaction.reply(hidden("Kendine veya botlara para gönderemezsin.")); if (current.cash < amount) return interaction.reply(hidden("Nakit bakiyen yetersiz.")); current.cash -= amount; addCash(settings, wallet(settings, target.id), amount); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Para gönderildi", `${interaction.user}, ${target} kullanıcısına ${money(settings, amount)} gönderdi.`); await interaction.reply(hidden(`${target} kullanıcısına ${money(settings, amount)} gönderildi.`)); return; }
    if (sub === "herkese-banka-ekle") { const amount = interaction.options.getInteger("miktar"); for (const member of interaction.guild.members.cache.values()) { if (!member.user.bot) wallet(settings, member.id).bank += amount; } updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Herkese banka bakiyesi eklendi", `${interaction.user} kişi başına ${money(settings, amount)} ekledi.`); await interaction.reply(hidden("Tüm kullanıcılara banka bakiyesi eklendi.")); return; }
    if (sub === "maksimum-bakiye") { settings.economy.maximumBalance = interaction.options.getInteger("miktar"); updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`Maksimum toplam bakiye ${money(settings, settings.economy.maximumBalance)} oldu.`)); return; }
    if (sub === "para") { const target = interaction.options.getUser("kullanici") || interaction.user; const targetWallet = wallet(settings, target.id); await interaction.reply(hidden(`${target}\nNakit: ${money(settings, targetWallet.cash)}\nBanka: ${money(settings, targetWallet.bank)}\nToplam: ${money(settings, total(targetWallet))}`)); return; }
    if (sub === "para-simgesi") { settings.economy.moneyEmoji = interaction.options.getString("simge"); updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden("Para simgesi güncellendi.")); return; }
    if (sub === "siralama") { const lines = Object.entries(settings.economy.users).sort(([, a], [, b]) => total(b) - total(a)).slice(0, 10).map(([id, user], index) => `**${index + 1}.** <@${id}> - ${money(settings, total(user))}`); await interaction.reply(hidden(lines.join("\n") || "Henüz ekonomi kaydı yok.")); return; }
    if (sub === "tumunu-sifirla") { for (const id of Object.keys(settings.economy.users)) resetUserWallet(settings, id); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Ekonomi sıfırlandı", `${interaction.user} tüm bakiyeleri ve envanterleri sıfırladı.`, 0xe74c3c); await interaction.reply(hidden("Tüm bakiyeler ve envanterler sıfırlandı.")); }
}

async function collectRoleIncome(interaction, settings, member) {
    const userWallet = wallet(settings, interaction.user.id);
    const now = Date.now(); let earned = 0; const details = [];
    for (const [roleId, income] of Object.entries(settings.economy.roleIncome)) {
        if (!member.roles.cache.has(roleId)) continue;
        const last = userWallet.roleClaims[roleId] || 0;
        if (now - last < income.intervalMs) continue;
        earned += income.amount; userWallet.roleClaims[roleId] = now; details.push(`${money(settings, income.amount)}`);
    }
    if (earned) addCash(settings, userWallet, earned);
    return { earned, details };
}
async function handleIncome(interaction) {
    if (!(await channelOnly(interaction))) return;
    const settings = data(interaction.guildId); const sub = interaction.options.getSubcommand(); const group = interaction.options.getSubcommandGroup(false); const current = wallet(settings, interaction.user.id); const now = Date.now();
    if (group === "rol-gelir" && ["ekle", "kaldir"].includes(sub) && !(await adminOnly(interaction))) return;
    if (sub === "calis") { if (now - current.lastWork < WORK_COOLDOWN) return interaction.reply(hidden(`Tekrar çalışmak için ${Math.ceil((WORK_COOLDOWN - now + current.lastWork) / 60000)} dakika beklemelisin.`)); const amount = 100 + random(401); current.lastWork = now; addCash(settings, current, amount); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Çalışma geliri", `${interaction.user} çalışarak ${money(settings, amount)} kazandı.`, 0x2ecc71); await interaction.reply(hidden(`Çalıştın ve ${money(settings, amount)} kazandın.`)); return; }
    if (group === "rol-gelir" && sub === "ekle") { const role = interaction.options.getRole("rol"); const amount = interaction.options.getInteger("miktar"); const minutes = interaction.options.getInteger("dakika"); settings.economy.roleIncome[role.id] = { amount, intervalMs: minutes * 60000 }; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${role} rolüne ${minutes} dakikada bir ${money(settings, amount)} gelir eklendi.`)); return; }
    if (group === "rol-gelir" && sub === "kaldir") { const role = interaction.options.getRole("rol"); delete settings.economy.roleIncome[role.id]; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${role} rolünün geliri kaldırıldı.`)); return; }
    if (group === "rol-gelir" && sub === "liste") { const lines = Object.entries(settings.economy.roleIncome).map(([id, income]) => `<@&${id}> - ${money(settings, income.amount)} / ${Math.round(income.intervalMs / 60000)} dakika`); await interaction.reply(hidden(lines.join("\n") || "Tanımlı rol geliri yok.")); return; }
    if (sub === "topla") { const result = await collectRoleIncome(interaction, settings, interaction.member); if (!result.earned) return interaction.reply(hidden("Şu an toplanabilecek rol geliri yok.")); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Rol geliri toplandı", `${interaction.user} rol gelirlerinden ${money(settings, result.earned)} topladı.`, 0x2ecc71); await interaction.reply(hidden(`${money(settings, result.earned)} rol geliri toplandı.`)); return; }
    if (sub === "soygun") { const target = interaction.options.getUser("kullanici"); const targetWallet = wallet(settings, target.id); if (target.bot || target.id === interaction.user.id) return interaction.reply(hidden("Kendini veya botları soyamazsın.")); if (now - current.lastRob < ROB_COOLDOWN) return interaction.reply(hidden("Soygun için biraz beklemelisin.")); current.lastRob = now; const success = random(100) < 40; const amount = Math.min(targetWallet.cash, Math.max(50, Math.floor(targetWallet.cash * 0.15))); if (success) { targetWallet.cash -= amount; addCash(settings, current, amount); } else current.cash = Math.max(0, current.cash - Math.min(50, current.cash)); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, success ? "Soygun başarılı" : "Soygun başarısız", success ? `${interaction.user}, ${target} kullanıcısından ${money(settings, amount)} aldı.` : `${interaction.user} soygun denedi ve başarısız oldu.`, success ? 0x2ecc71 : 0xe74c3c); await interaction.reply(hidden(success ? `${target} kullanıcısından ${money(settings, amount)} aldın.` : "Soygun başarısız oldu; 50 para kaybettin.")); return; }
    if (sub === "suc") { const amount = 50 + random(251); const success = random(100) < 65; if (success) addCash(settings, current, amount); else current.cash = Math.max(0, current.cash - Math.min(current.cash, 25)); updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, success ? "Suç geliri" : "Suç başarısız", success ? `${interaction.user} suç işleyerek ${money(settings, amount)} kazandı.` : `${interaction.user} suç işledi ancak başarısız oldu.`, success ? 0x2ecc71 : 0xe74c3c); await interaction.reply(hidden(success ? `Suç başarılı, ${money(settings, amount)} kazandın.` : "Suç başarısız oldu ve 25 para kaybettin.")); }
}

function itemKey(name) { return name.toLowerCase().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ -]/gi, "").trim().replace(/\s+/g, "-"); }
async function handleItems(interaction) {
    if (!(await channelOnly(interaction))) return;
    const settings = data(interaction.guildId); const sub = interaction.options.getSubcommand(); const group = interaction.options.getSubcommandGroup(false);
    if (["olustur", "duzenle"].includes(sub) || (group === "aksiyon" && ["ekle", "kaldir"].includes(sub))) { if (!(await adminOnly(interaction))) return; }
    if (sub === "olustur") { const name = interaction.options.getString("urun"); const id = itemKey(name); if (settings.economy.items[id]) return interaction.reply(hidden("Bu ürün zaten var.")); settings.economy.items[id] = { name, price: interaction.options.getInteger("fiyat"), description: interaction.options.getString("aciklama") || "", icon: interaction.options.getString("ikon") || "", buyable: true, sellable: true, buybackRate: 0.5, stock: null, consumable: true, roleId: null, action: null, actionValue: null }; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${name} mağazaya eklendi.`)); return; }
    if (group === "aksiyon" && sub === "ekle") { const name = interaction.options.getString("urun"); const found = findItem(settings, name); if (!found) return interaction.reply(hidden("Bu ürün bulunamadı.")); found[1].action = interaction.options.getString("aksiyon"); found[1].actionValue = interaction.options.getString("deger"); updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${found[1].name} aksiyonu güncellendi.`)); return; }
    if (group === "aksiyon" && sub === "kaldir") { const found = findItem(settings, interaction.options.getString("urun")); if (!found) return interaction.reply(hidden("Bu ürün bulunamadı.")); found[1].action = null; found[1].actionValue = null; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${found[1].name} aksiyonu kaldırıldı.`)); return; }
    if (sub === "duzenle") { const found = findItem(settings, interaction.options.getString("urun")); if (!found) return interaction.reply(hidden("Bu ürün bulunamadı.")); const field = interaction.options.getString("alan"); const value = interaction.options.getString("deger"); const item = found[1]; if (field === "fiyat") item.price = Math.max(0, Number(value) || 0); if (field === "aciklama") item.description = value; if (field === "ikon") item.icon = value; if (field === "satilabilir") item.sellable = parseBoolean(value); if (field === "geri-alim-orani") item.buybackRate = Math.max(0, Math.min(1, Number(value) || 0)); if (field === "stok") item.stock = value.toLowerCase() === "sinirsiz" ? null : Math.max(0, Number(value) || 0); if (field === "tuketilebilir") item.consumable = parseBoolean(value); updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${item.name} ürünü güncellendi.`)); return; }
    if (sub === "liste") { const lines = Object.values(settings.economy.items).map(item => `${item.icon || ""} **${item.name}** - ${money(settings, item.price)}\n${item.description || "Açıklama yok."}${item.stock === null ? " | Stok: Sınırsız" : ` | Stok: ${item.stock}`}`); await interaction.reply(hidden(lines.join("\n\n") || "Mağazada ürün yok.")); return; }
    if (sub === "satin-al") { const found = findItem(settings, interaction.options.getString("urun")); const amount = interaction.options.getInteger("adet"); if (!found) return interaction.reply(hidden("Bu ürün bulunamadı.")); const item = found[1]; if (!item.buyable) return interaction.reply(hidden("Bu ürün satılmıyor.")); if (item.stock !== null && item.stock < amount) return interaction.reply(hidden("Yeterli stok yok.")); const cost = item.price * amount; if (wallet(settings, interaction.user.id).cash < cost) return interaction.reply(hidden("Yeterli nakit paran yok.")); wallet(settings, interaction.user.id).cash -= cost; wallet(settings, interaction.user.id).items[found[0]] = (wallet(settings, interaction.user.id).items[found[0]] || 0) + amount; if (item.stock !== null) item.stock -= amount; updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Item satın alındı", `${interaction.user} ${amount} adet ${item.name} satın aldı.`); await interaction.reply(hidden(`${item.name} satın alındı ve envanterine eklendi.`)); return; }
    if (sub === "kullan") return useItem(interaction, settings, interaction.options.getString("urun"));
}

async function useItem(interaction, settings, name) { const found = findItem(settings, name); const userWallet = wallet(settings, interaction.user.id); if (!found || !(userWallet.items[found[0]] > 0)) { await interaction.reply(hidden("Bu item envanterinde yok.")); return; } const item = found[1]; let message = `${item.name} kullanıldı.`; if (item.action === "bakiye-duzenle") addCash(settings, userWallet, Number(item.actionValue) || 0); else if (item.action === "rol-duzenle") { const role = interaction.guild.roles.cache.get(item.actionValue); if (role) await interaction.member.roles.add(role); } else if (item.action === "mesaj-gonder") message = item.actionValue || message; else if (item.action === "urun-duzenle" || item.action === "json") { try { const payload = JSON.parse(item.actionValue); if (Number.isFinite(payload.cash)) addCash(settings, userWallet, payload.cash); if (payload.roleId) { const role = interaction.guild.roles.cache.get(payload.roleId); if (role) await interaction.member.roles.add(role); } if (payload.description) item.description = String(payload.description).slice(0, 1000); if (payload.price !== undefined) item.price = Math.max(0, Number(payload.price) || 0); } catch { message = "Item JSON aksiyonu geçersiz."; } } if (item.consumable) userWallet.items[found[0]] -= 1; updateGuildSettings(interaction.guildId, () => settings); await logAction(interaction, "Item kullanıldı", `${interaction.user} ${item.name} kullandı.`); await interaction.reply(hidden(message)); }

async function handleItemManage(interaction) { if (!(await channelOnly(interaction))) return; const settings = data(interaction.guildId); const sub = interaction.options.getSubcommand(); if (sub === "sil") { const userWallet = wallet(settings, interaction.user.id); const found = findItem(settings, interaction.options.getString("urun")); if (!found || !(userWallet.items[found[0]] > 0)) return interaction.reply(hidden("Bu item envanterinde yok.")); delete userWallet.items[found[0]]; updateGuildSettings(interaction.guildId, () => settings); await interaction.reply(hidden(`${found[1].name} envanterinden silindi.`)); return; } const items = Object.entries(wallet(settings, interaction.user.id).items).map(([id, count]) => `${settings.economy.items[id]?.name || id}: ${count}`); await interaction.reply(hidden(items.join("\n") || "Envanterin boş.")); }

module.exports = { commands, handleEconomy, handleIncome, handleItems, handleItemManage };
