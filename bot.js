const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const express = require('express');
const path = require('path');

// ── Vérification des variables d'environnement ──────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN manquant dans les variables d\'environnement');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY manquant dans les variables d\'environnement');
  process.exit(1);
}

// ── Clients ──────────────────────────────────────────────────────────────────
const bot       = new Telegraf(TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Historique des conversations (par utilisateur) ───────────────────────────
const conversations = new Map();
const MAX_HISTORY   = 20; // messages max conservés par utilisateur

// ── Prompt système ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'assistant virtuel de MySelfie Studio, un service premium de location de photobooth à La Réunion. Tu aides les clients à choisir le bon forfait, réponds à leurs questions sur les prix et les services, et les orientes vers une réservation.

## Nos forfaits :
- **Photobooth Classique Digital** — 290 € / 3 h : impressions illimitées, fond personnalisé, galerie en ligne
- **Miroir Photobooth** ⭐ (le plus populaire) — 390 € / 3 h : grand miroir interactif, animations, partage immédiat
- **Vidéobooth 360°** — 490 € / 3 h : vidéos à 360°, effets ralenti, résultats spectaculaires
- **Pack Premium Complet** — 790 € / 4 h : tout inclus, décoration sur mesure, assistant dédié

## Infos pratiques :
- Zone de service : toute l'île de La Réunion
- Contact : +262 693 000 000 | contact@myselfiestudio.re
- Service clé en main, personnalisation complète, technicien présent

## Ton comportement :
- Réponds principalement en français (ou dans la langue du client)
- Sois chaleureux, professionnel et enthousiaste
- Aide le client à identifier ses besoins (type d'événement, nombre de personnes, budget)
- Oriente-le vers le forfait le plus adapté
- Si on te demande de réserver, invite à appeler ou envoyer un email`;

// ── Commande /start ──────────────────────────────────────────────────────────
bot.start((ctx) => {
  conversations.delete(ctx.from.id);
  ctx.reply(
    '👋 Bonjour ! Je suis l\'assistant de *MySelfie Studio*, votre spécialiste photobooth à La Réunion.\n\n' +
    'Comment puis-je vous aider pour votre événement ? 🎉📸',
    { parse_mode: 'Markdown' }
  );
});

// ── Commande /reset ──────────────────────────────────────────────────────────
bot.command('reset', (ctx) => {
  conversations.delete(ctx.from.id);
  ctx.reply('🔄 Conversation réinitialisée. Comment puis-je vous aider ?');
});

// ── Commande /tarifs ─────────────────────────────────────────────────────────
bot.command('tarifs', (ctx) => {
  ctx.reply(
    '💰 *Nos forfaits photobooth :*\n\n' +
    '📷 *Classique Digital* — 290 €/3h\n' +
    '🪞 *Miroir Photobooth* — 390 €/3h ⭐\n' +
    '🎥 *Vidéobooth 360°* — 490 €/3h\n' +
    '✨ *Pack Premium* — 790 €/4h\n\n' +
    '_Posez-moi vos questions ou appelez le +262 693 000 000_',
    { parse_mode: 'Markdown' }
  );
});

// ── Messages texte → Claude ──────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const userId      = ctx.from.id;
  const userMessage = ctx.message.text;

  // Initialiser l'historique si nécessaire
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  const history = conversations.get(userId);
  history.push({ role: 'user', content: userMessage });

  // Garder seulement les N derniers messages
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  try {
    await ctx.sendChatAction('typing');

    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   history,
      thinking:   { type: 'adaptive' },
    });

    const reply = response.content.find((b) => b.type === 'text')?.text
      ?? 'Désolé, je n\'ai pas pu générer une réponse. Veuillez réessayer.';

    history.push({ role: 'assistant', content: reply });

    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      // Fallback sans markdown si le formatage pose problème
      ctx.reply(reply)
    );
  } catch (error) {
    console.error('Erreur Claude API:', error.message);
    await ctx.reply('⚠️ Une erreur est survenue. Veuillez réessayer dans un instant.');
  }
});

// ── Serveur web (fichiers statiques du site) ─────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`🌐 Serveur web démarré sur le port ${PORT}`);
});

// ── Démarrage du bot (long polling) ─────────────────────────────────────────
bot.launch().then(() => {
  console.log('🤖 Bot Telegram démarré (long polling)');
}).catch((err) => {
  console.error('Erreur démarrage bot:', err.message);
  process.exit(1);
});

// Arrêt propre
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
