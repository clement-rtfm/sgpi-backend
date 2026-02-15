const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");  // 🆕
const axios = require("axios"); // 🆕
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

let currentInvite = null;
let currentInviteCode = null;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// 🆕 CORS pour Neocities
app.use(cors({
    origin: [
        "https://rpmn0ise.neocities.org",  // 🔴 REMPLACE par ton vrai site
        "http://localhost:8080"
    ],
    credentials: true
}));

// 🆕 Body parser
app.use(express.json());

// Nettoyage des invitations du bot
async function cleanupBotInvites() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const invites = await guild.invites.fetch();
        
        console.log(`Nettoyage : ${invites.size} invitation(s) trouvée(s)`);
        
        for (const [code, invite] of invites) {
            if (invite.inviter?.id === client.user.id) {
                try {
                    await invite.delete();
                    console.log(`Invitation bot supprimée : ${code}`);
                } catch {}
            }
        }
        
        console.log("Nettoyage terminé");
    } catch (err) {
        console.error("Erreur nettoyage bot :", err);
    }
}

// Générer nouvelle invite Discord
async function generateInvite() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channel = guild.channels.cache.find(c => c.isTextBased());
        
        if (!channel) {
            console.log("Aucun salon texte trouvé.");
            return;
        }

        if (currentInviteCode) {
            try {
                await guild.invites.delete(currentInviteCode);
            } catch {}
        }

        const invite = await channel.createInvite({
            maxAge: 3 * 24 * 60 * 60,
            maxUses: 0,
            unique: true
        });

        currentInvite = invite.url;
        currentInviteCode = invite.code;
        console.log("Nouvelle invite créée :", currentInvite);
    } catch (err) {
        console.error("Erreur génération invite :", err);
    }
}

function isFriday() {
    return new Date().getDay() === 5;
}

function msUntilNextFriday() {
    const now = new Date();
    const targetDay = 5;
    const daysUntilFriday = (targetDay - now.getDay() + 7) % 7 || 7;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilFriday);
    nextFriday.setHours(0, 0, 0, 0);
    return nextFriday - now;
}

client.once("ready", async () => {
    console.log(`Bot connecté : ${client.user.tag}`);
    
    await cleanupBotInvites();
    await generateInvite();
    
    if (isFriday()) {
        console.log("Vendredi : l'invite est accessible normalement.");
    }
    
    setTimeout(async () => {
        await generateInvite();
        setInterval(generateInvite, 7 * 24 * 60 * 60 * 1000);
    }, msUntilNextFriday());
});

client.login(process.env.DISCORD_TOKEN);

// 🆕 Endpoint de vérification captcha
app.post("/api/verify-captcha", async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ success: false, error: "Token manquant" });
    }
    
    try {
        const response = await axios.post("https://hcaptcha.com/siteverify", null, {
            params: {
                secret: process.env.HCAPTCHA_SECRET,
                response: token
            }
        });
        
        const data = response.data;
        
        if (data.success) {
            console.log("✅ Captcha validé");
            return res.json({ success: true });
        } else {
            console.log("❌ Captcha invalide :", data["error-codes"]);
            return res.json({ success: false, error: "Captcha invalide" });
        }
    } catch (err) {
        console.error("Erreur vérification captcha :", err);
        return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
});

// API Discord link
app.get("/api/discord-link", (req, res) => {
    const adminKey = req.query.admin_key;
    
    if (adminKey && adminKey === process.env.ADMIN_KEY) {
        return res.json({ link: currentInvite });
    }
    
    if (!isFriday()) {
        return res.status(503).json({ error: "Accès fermé" });
    }
    
    res.json({ link: currentInvite });
});

app.listen(PORT, () => {
    console.log("Backend actif sur le port", PORT);
});