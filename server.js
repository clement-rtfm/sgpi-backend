const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

let currentInvite = null;
let currentInviteCode = null;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// CORS pour Neocities
app.use(cors({
    origin: [
        "https://rpmn0ise.neocities.org",
        "http://localhost:8080"
    ],
    credentials: true
}));

// Body parser
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
            maxAge: 24 * 60 * 60,
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

// Fonction helper pour générer token aléatoire
function generateRandomToken(length = 16) {
    const array = new Uint8Array(length);
    require('crypto').randomFillSync(array);
    return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
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

// ============================================
// ENDPOINTS API
// ============================================

// Endpoint de validation finale (avec bypass admin)
app.get("/api/final-validation", async (req, res) => {
    const encodedToken = req.query.t;
    const adminKey = req.query.admin_key;
    
    // 🔑 MODE ADMIN : Bypass total
    if (adminKey && adminKey === process.env.ADMIN_KEY) {
        console.log("🔓 Accès admin détecté");
        
        if (!currentInvite) {
            return res.status(503).send("Invitation non disponible");
        }
        
        const randomToken = generateRandomToken(12);
        const dynamicLink = currentInvite + "?k=" + randomToken;
        const encoded = Buffer.from(dynamicLink).toString('base64');
        
        return res.send(`
            <html>
                <head>
                    <title>Accès Admin</title>
                    <style>
                        body {
                            font-family: monospace;
                            padding: 50px;
                            text-align: center;
                            background: #1a1a1a;
                            color: #ffa500;
                        }
                        pre {
                            background: #000;
                            padding: 20px;
                            border: 2px solid #ffa500;
                            display: inline-block;
                            font-size: 14px;
                            word-break: break-all;
                        }
                        button {
                            margin: 10px 5px;
                            padding: 10px 20px;
                            background: #ffa500;
                            color: #000;
                            border: none;
                            cursor: pointer;
                            font-family: monospace;
                            font-size: 16px;
                        }
                        .badge {
                            background: #ffa500;
                            color: #000;
                            padding: 5px 10px;
                            border-radius: 5px;
                            font-weight: bold;
                        }
                    </style>
                </head>
                <body>
                    <span class="badge">👑 MODE ADMIN</span>
                    <h1>✅ Accès validé</h1>
                    <p>Décode ce texte en Base64 pour obtenir ton lien Discord :</p>
                    <pre id="code">${encoded}</pre>
                    <br>
                    <button onclick="copyCode()">📋 Copier</button>
                    
                    <script>
                        function copyCode() {
                            const code = document.getElementById('code').textContent;
                            navigator.clipboard.writeText(code);
                            alert('✅ Copié dans le presse-papier !');
                        }
                        
                        function autoDecode() {
                            const code = document.getElementById('code').textContent;
                            const decoded = atob(code);
                            window.location.href = decoded;
                        }
                    </script>
                </body>
            </html>
        `);
    }
    
    // MODE NORMAL : Vérification captcha
    if (!encodedToken) {
        return res.status(400).send(`
            <html>
                <head><title>Erreur</title></head>
                <body style="font-family: monospace; padding: 50px; text-align: center;">
                    <h1>❌ Token manquant</h1>
                    <p>Retourne sur le site et recommence.</p>
                </body>
            </html>
        `);
    }
    
    // Décoder le token
    let captchaToken;
    try {
        captchaToken = Buffer.from(encodedToken, 'base64').toString('utf-8');
    } catch (err) {
        return res.status(400).send("Token invalide");
    }
    
    // Vérifier le captcha avec hCaptcha
    try {
        const response = await axios.post("https://hcaptcha.com/siteverify", null, {
            params: {
                secret: process.env.HCAPTCHA_SECRET,
                response: captchaToken
            }
        });
        
        const data = response.data;
        
        if (!data.success) {
            console.log("❌ Captcha invalide :", data["error-codes"]);
            return res.status(403).send(`
                <html>
                    <head><title>Accès invalide</title></head>
                    <body style="font-family: monospace; padding: 50px; text-align: center;">
                        <h1>❌ Accès invalide ou expiré</h1>
                        <p>Attends vendredi prochain.</p>
                        <a href="https://rpmn0ise.neocities.org/sgpi/acces">← Retour</a>
                    </body>
                </html>
            `);
        }
        
        console.log("✅ Captcha validé");
        
        // Vérifier que c'est vendredi
        if (!isFriday()) {
            return res.status(403).send(`
                <html>
                    <head><title>Accès fermé</title></head>
                    <body style="font-family: monospace; padding: 50px; text-align: center;">
                        <h1>🔒 Accès fermé</h1>
                        <p>L'accès n'est ouvert que le vendredi.</p>
                        <a href="https://rpmn0ise.neocities.org/sgpi/acces">← Retour</a>
                    </body>
                </html>
            `);
        }
        
        // Tout est OK → Afficher l'invitation encodée en Base64
        if (!currentInvite) {
            return res.status(503).send("Invitation non disponible");
        }
        
        const randomToken = generateRandomToken(12);
        const dynamicLink = currentInvite + "?k=" + randomToken;
        const encoded = Buffer.from(dynamicLink).toString('base64');
        
        return res.send(`
            <html>
                <head>
                    <title>Accès validé</title>
                    <style>
                        body {
                            font-family: monospace;
                            padding: 50px;
                            text-align: center;
                            background: #1a1a1a;
                            color: #00ff00;
                        }
                        pre {
                            background: #000;
                            padding: 20px;
                            border: 2px solid #00ff00;
                            display: inline-block;
                            font-size: 14px;
                            word-break: break-all;
                        }
                        button {
                            margin-top: 20px;
                            padding: 10px 20px;
                            background: #00ff00;
                            color: #000;
                            border: none;
                            cursor: pointer;
                            font-family: monospace;
                            font-size: 16px;
                        }
                    </style>
                </head>
                <body>
                    <h1>✅ Accès validé</h1>
                    <p>Décode ce texte en Base64 pour obtenir ton lien Discord :</p>
                    <pre id="code">${encoded}</pre>
                    <br>
                    <button onclick="copyCode()">📋 Copier</button>
                    
                    <script>
                        function copyCode() {
                            const code = document.getElementById('code').textContent;
                            navigator.clipboard.writeText(code);
                            alert('✅ Copié dans le presse-papier !');
                        }
                    </script>
                </body>
            </html>
        `);
        
    } catch (err) {
        console.error("Erreur vérification captcha :", err);
        return res.status(500).send("Erreur serveur");
    }
});

// Endpoint admin rapide (juste le lien brut)
app.get("/api/admin/invite", (req, res) => {
    const adminKey = req.query.key;
    
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: "Accès refusé" });
    }
    
    if (!currentInvite) {
        return res.status(503).json({ error: "Invitation non disponible" });
    }
    
    res.json({ 
        invite: currentInvite,
        created: new Date().toISOString(),
        mode: "admin"
    });
});

// Dashboard admin
app.get("/api/admin/dashboard", (req, res) => {
    const adminKey = req.query.key;
    
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).send("Accès refusé");
    }
    
    const isOpen = isFriday();
    const nextFriday = new Date();
    const daysUntil = (5 - nextFriday.getDay() + 7) % 7 || 7;
    nextFriday.setDate(nextFriday.getDate() + daysUntil);
    
    res.send(`
        <html>
            <head>
                <title>Admin Dashboard</title>
                <style>
                    body { 
                        font-family: monospace; 
                        padding: 30px; 
                        background: #0a0a0a; 
                        color: #ffa500; 
                    }
                    .card {
                        background: #1a1a1a;
                        border: 2px solid #ffa500;
                        padding: 20px;
                        margin: 10px 0;
                        border-radius: 5px;
                    }
                    .status-open { color: #00ff00; }
                    .status-closed { color: #ff0000; }
                    button {
                        background: #ffa500;
                        color: #000;
                        border: none;
                        padding: 10px 20px;
                        cursor: pointer;
                        margin: 5px;
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                <h1>👑 SGPI Admin Dashboard</h1>
                
                <div class="card">
                    <h2>État du serveur</h2>
                    <p>Statut : <span class="${isOpen ? 'status-open' : 'status-closed'}">${isOpen ? '✅ OUVERT' : '🔒 FERMÉ'}</span></p>
                    <p>Prochaine ouverture : ${nextFriday.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                
                <div class="card">
                    <h2>Invitation actuelle</h2>
                    <p><strong>${currentInvite || 'Aucune invitation'}</strong></p>
                    <button onclick="copyInvite()">📋 Copier</button>
                    <button onclick="window.open('${currentInvite}', '_blank')">🚀 Ouvrir</button>
                </div>
                
                <div class="card">
                    <h2>Actions rapides</h2>
                    <button onclick="location.reload()">🔄 Rafraîchir</button>
                    <button onclick="window.location='/api/final-validation?admin_key=${adminKey}'">🎯 Accès final</button>
                </div>
                
                <script>
                    function copyInvite() {
                        navigator.clipboard.writeText('${currentInvite}');
                        alert('✅ Lien copié !');
                    }
                </script>
            </body>
        </html>
    `);
});

// API Discord link (ancienne version, toujours fonctionnelle)
// API Discord link (version keep-alive friendly)
app.get("/api/discord-link", (req, res) => {
    const adminKey = req.query.admin_key;
    
    // Mode admin : toujours retourner l'invite
    if (adminKey && adminKey === process.env.ADMIN_KEY) {
        return res.json({ 
            link: currentInvite,
            status: "admin",
            available: true
        });
    }
    
    // Mode normal : retourner 200 même si fermé
    if (!isFriday()) {
        return res.status(200).json({ 
            error: "Accès fermé", 
            available: false,
            nextOpening: "Vendredi prochain"
        });  // ✅ 200 = UP (mais fermé)
    }
    
    // Vendredi : retourner l'invite
    res.json({ 
        link: currentInvite,
        status: "open",
        available: true
    });
});

app.listen(PORT, () => {
    console.log("Backend actif sur le port", PORT);
});