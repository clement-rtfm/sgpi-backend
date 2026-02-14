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

// Générer nouvelle invite Discord
async function generateInvite() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channel = guild.channels.cache.find(c => c.isTextBased());

        if (!channel) {
            console.log("Aucun salon texte trouvé.");
            return;
        }

        // Supprime ancienne invite si existante
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
    } catch (err) {
        console.error("Erreur génération invite :", err);
    }
}

// Retourne true si aujourd'hui c'est vendredi
function isFriday() {
    return new Date().getDay() === 5;
}

// Calcul du temps restant jusqu'au prochain vendredi 00:00
function msUntilNextFriday() {
    const now = new Date();
    const targetDay = 5; // vendredi
    const daysUntilFriday = (targetDay - now.getDay() + 7) % 7 || 7;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilFriday);
    nextFriday.setHours(0, 0, 0, 0);
    return nextFriday - now;
}

client.once("ready", async () => {
    console.log(`Bot connecté : ${client.user.tag}`);

    // Ne pas générer d'invite si ce n'est pas vendredi
    if (isFriday()) {
        await generateInvite();
    }

    // Planification pour le prochain vendredi
    setTimeout(async () => {
        await generateInvite();
        setInterval(generateInvite, 7 * 24 * 60 * 60 * 1000); // toutes les semaines
    }, msUntilNextFriday());
});

client.login(process.env.DISCORD_TOKEN);

// API pour le site
app.get("/api/discord-link", (req, res) => {
    const adminKey = req.query.admin_key;

    // Accès admin : toujours
    if (adminKey && adminKey === process.env.ADMIN_KEY) {
        return res.json({ link: currentInvite || "Pas encore généré, attends vendredi pour le lien normal." });
    }

    // Mode normal : seulement le vendredi
    if (!isFriday()) {
        return res.status(503).json({ error: "Accès fermé" });
    }

    if (!currentInvite) {
        return res.status(503).json({ error: "Invite non générée, réessaie dans quelques secondes." });
    }

    res.json({ link: currentInvite });
});

app.listen(PORT, () => {
    console.log("Backend actif sur le port", PORT);
});
