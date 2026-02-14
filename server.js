const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

let currentInvite = null;
let currentInviteCode = null;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Générer nouvelle invite
async function generateInvite() {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = guild.channels.cache.find(c => c.isTextBased());

    if (!channel) {
        console.log("Aucun salon texte trouvé.");
        return;
    }

    // Supprime ancienne invite
    if (currentInviteCode) {
        try {
            await guild.invites.delete(currentInviteCode);
        } catch {}
    }

    // Crée invite valide 3 jours
    const invite = await channel.createInvite({
        maxAge: 3 * 24 * 60 * 60,
        maxUses: 0,
        unique: true
    });

    currentInvite = invite.url;
    currentInviteCode = invite.code;

    console.log("Nouvelle invite créée :", currentInvite);
}

// Calcul prochain jeudi 00:00
function msUntilNextThursday() {
    const now = new Date();
    const day = now.getDay(); // 4 = jeudi
    const daysUntilThursday = (6 - day + 7) % 7 || 7;

    const nextThursday = new Date(now);
    nextThursday.setDate(now.getDate() + daysUntilThursday);
    nextThursday.setHours(0, 0, 0, 0);

    return nextThursday - now;
}

client.once("ready", async () => {
    console.log(`Bot connecté : ${client.user.tag}`);

    setTimeout(() => {
        generateInvite();
        setInterval(generateInvite, 7 * 24 * 60 * 60 * 1000);
    }, msUntilNextThursday());
});

client.login(process.env.DISCORD_TOKEN);

// API pour le site
app.get("/api/discord-link", (req, res) => {
    if (!currentInvite) {
        return res.status(503).json({ error: "Accès fermé" });
    }
    res.json({ link: currentInvite });
});

app.listen(PORT, () => {
    console.log("Backend actif sur port", PORT);
});
