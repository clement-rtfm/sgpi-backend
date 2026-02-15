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

// 🆕 Fonction de nettoyage (AVANT le client.once)
async function cleanupBotInvites() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const invites = await guild.invites.fetch();
        
        console.log(`Nettoyage : ${invites.size} invitation(s) trouvée(s)`);
        
        for (const [code, invite] of invites) {
            // Supprimer seulement les invitations créées par ce bot
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
    console.log(`Bot connecté : ${client.user.tag}`);  // ✅ Bug corrigé
    
    // 🆕 1. Nettoyer TOUTES les anciennes invitations du bot
    await cleanupBotInvites();
    
    // 2. Générer une nouvelle invite
    await generateInvite();
    
    // 3. Si c'est vendredi, message de confirmation
    if (isFriday()) {
        console.log("Vendredi : l'invite est accessible normalement.");
    }
    
    // 4. Planification pour le prochain vendredi
    setTimeout(async () => {
        await generateInvite();
        setInterval(generateInvite, 7 * 24 * 60 * 60 * 1000);
    }, msUntilNextFriday());
});

client.login(process.env.DISCORD_TOKEN);

// API pour le site
app.get("/api/discord-link", (req, res) => {
    const adminKey = req.query.admin_key;
    
    // Accès admin : toujours retourne currentInvite même hors vendredi
    if (adminKey && adminKey === process.env.ADMIN_KEY) {
        return res.json({ link: currentInvite });
    }
    
    // Mode normal : seulement le vendredi
    if (!isFriday()) {
        return res.status(503).json({ error: "Accès fermé" });
    }
    
    res.json({ link: currentInvite });
});

app.listen(PORT, () => {
    console.log("Backend actif sur le port", PORT);
});