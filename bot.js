require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const OpenAI = require("openai").default;
const fs = require("fs");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const XP_PER_MESSAGE = 1;
const USER_DATA_FILE = "user_data.json";

let userXP = {};
let userConversations = {};

function loadUserData() {
    if (fs.existsSync(USER_DATA_FILE)) {
        userXP = JSON.parse(fs.readFileSync(USER_DATA_FILE, "utf-8"));
    } else {
        userXP = {};
    }
}

function saveUserData() {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userXP, null, 2));
}

function getXPForLevel(level) {
    if (level === 0) return 0;
    if (level === 1) return 10;
    return 10 + (level - 1) * 50;
}

function getUserLevel(userId) {
    const xp = userXP[userId] || 0;
    let level = 0;
    while (getXPForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
}

function getXPToNextLevel(userId) {
    const currentXP = userXP[userId] || 0;
    const currentLevel = getUserLevel(userId);
    const nextLevelXP = getXPForLevel(currentLevel + 1);
    return nextLevelXP - currentXP;
}

function addXP(userId, amount) {
    const oldLevel = getUserLevel(userId);
    if (!userXP[userId]) userXP[userId] = 0;
    userXP[userId] += amount;
    saveUserData();
    const newLevel = getUserLevel(userId);
    return newLevel > oldLevel ? newLevel : null;
}

client.once("ready", () => {
    loadUserData();
    console.log(`❄️wave❄️ logged in as ${client.user.tag}`);
    client.user.setActivity("❄️wave❄️", { type: "WATCHING" });
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const isMentioned = message.mentions.has(client.user.id);
    const isDM = message.channel.type === ChannelType.DM;

    if (!isMentioned && !isDM) return;

    await message.channel.sendTyping();

    try {
        const userId = message.author.id;

        const newLevel = addXP(userId, XP_PER_MESSAGE);
        if (newLevel !== null) {
            const embed = {
                title: "🎉 مبروك!",
                description: `${message.author} صار مستواك الي **${newLevel}** 🎉`,
                color: 0xffd700,
            };
            await message.channel.send({ embeds: [embed] });
        }

        if (!userConversations[userId]) {
            userConversations[userId] = [];
        }

        userConversations[userId].push({
            role: "user",
            content: message.content,
        });

        if (userConversations[userId].length > 20) {
            userConversations[userId] = userConversations[userId].slice(-20);
        }

        const aiClient = new OpenAI({
            baseURL: "https://api.xkiro.com/v1",
            apiKey: "free",
        });

        const response = await aiClient.chat.completions.create({
            model: "anthropic/claude-fable-5",
            messages: [
                {
                    role: "system",
                    content: "أنت مساعد ذكي يتحدث باللغة العربية فقط. رد على جميع الأسئلة والرسائل باللغة العربية بطريقة طبيعية وودية.",
                },
                ...userConversations[userId],
            ],
            max_tokens: 1024,
        });

        const aiResponse = response.choices[0].message.content;

        userConversations[userId].push({
            role: "assistant",
            content: aiResponse,
        });

        if (aiResponse.length > 2000) {
            const chunks = aiResponse.match(/[\s\S]{1,2000}/g);
            for (const chunk of chunks) {
                await message.reply({
                    content: chunk,
                    allowedMentions: { repliedUser: false },
                });
            }
        } else {
            await message.reply({
                content: aiResponse,
                allowedMentions: { repliedUser: false },
            });
        }
    } catch (error) {
        console.error(error);
        await message.reply({
            content: `خطأ: ${error.message}`,
            allowedMentions: { repliedUser: false },
        });
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith("!level")) {
        const level = getUserLevel(message.author.id);
        const xp = userXP[message.author.id] || 0;
        const xpNext = getXPToNextLevel(message.author.id);
        const embed = {
            title: `مستوى ${message.author.username}`,
            description: `**المستوى:** ${level}\n**النقاط:** ${xp}\n**النقاط للمستوى التالي:** ${xpNext}`,
            color: 0x0099ff,
        };
        await message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith("!leaderboard")) {
        const sorted = Object.entries(userXP)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let description = "";
        for (let i = 0; i < sorted.length; i++) {
            const [userId, xp] = sorted[i];
            let level = 0;
            while (getXPForLevel(level + 1) <= xp) {
                level++;
            }
            description += `#${i + 1} <@${userId}> - المستوى ${level}\n`;
        }

        const embed = {
            title: "🏆 لائحة الصدارة",
            description,
            color: 0xffd700,
        };
        await message.reply({ embeds: [embed] });
    }
});

client.login(BOT_TOKEN);
