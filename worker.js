import { Bot, InlineKeyboard, Keyboard, webhookCallback } from "grammy";

/**
 * Cloudflare Worker Implementation
 */

export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const bot = new Bot(env.BOT_TOKEN);

      // --- 1. Localization Strings ---
      const strings = {
        en: {
          welcome: "Welcome! Please choose your language:",
          request_contact: "Please share your phone number to complete registration.",
          contact_button: "Share Phone Number 📱",
          search_searching: "🔍 Searching for answers...",
          search_no_result: "❌ I couldn't find any relevant information.",
          broadcast_prompt: "Please send the message (text, image, video, document, etc.) you want to broadcast.",
          broadcast_done: "✅ Broadcast finished. Sent to {count} users.",
          admin_only: "⚠️ This command is for admins only.",
          reg_success: "✅ Registration successful! You can now ask any question."
        },
        am: {
          welcome: "እንኳን ደህና መጡ! እባክዎን ቋንቋ ይምረጡ፦",
          request_contact: "እባክዎን ምዝገባውን ለማጠናቀቅ ስልክ ቁጥርዎን ያጋሩ።",
          contact_button: "ስልክ ቁጥር ያጋሩ 📱",
          search_searching: "🔍 በመፈለግ ላይ...",
          search_no_result: "❌ ምንም ውጤት አልተገኘም።",
          broadcast_prompt: "እባክዎን ለሁሉም እንዲላክ የሚፈልጉትን መልዕክት (ጽሁፍ፣ ምስል፣ ቪዲዮ...) ይላኩ።",
          broadcast_done: "✅ መልዕክቱ ለ {count} ተጠቃሚዎች ተልኳል።",
          admin_only: "⚠️ ይህ ለአድሚን ብቻ የተፈቀደ ነው።",
          reg_success: "✅ ምዝገባው ተጠናቋል። አሁን የሚፈልጉትን ጥያቄ መጠየቅ ይችላሉ።"
        },
        or: {
          welcome: "Baga nagaan dhuftan! Maaloo afaan keessan filadhaa:",
          request_contact: "Maaloo galmee xumuruuf lakkoofsa bilbilaa keessan nuuf qoodaa.",
          contact_button: "Lakkoofsa Bilbilaa Qoodi 📱",
          search_searching: "🔍 Barbaadaa jira...",
          search_no_result: "❌ Oofni hin argamne.",
          broadcast_prompt: "Maaloo ergaa hundaaf dabarsuu barbaaddan ergaa.",
          broadcast_done: "✅ Ergaan gara namoota {count} tti ergameera.",
          admin_only: "⚠️ Kun admin qofaaf.",
          reg_success: "✅ Galmeen xumurameera. Amma gaaffii keessan gaafachuu dandeessu."
        }
      };

      // --- 2. Middleware: Fetch User Data ---
      // This runs on every request to identify the user
      const getUser = async (ctx) => {
        try {
          const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
            .bind(ctx.from.id)
            .run();
          return user.results[0] || null;
        } catch (e) {
          return null;
        }
      };

      // --- 3. Commands & Handlers ---

      // /start Command
      bot.command("start", async (ctx) => {
        const keyboard = new InlineKeyboard()
          .text("Amharic 🇪🇹", "lang_am")
          .text("Afan Oromo 🇪🇹", "lang_or")
          .text("English 🇺🇸", "lang_en");

        await ctx.reply(strings.en.welcome, { reply_markup: keyboard });
      });

      // Handle Language Selection
      bot.callbackQuery(/lang_(.+)/, async (ctx) => {
        const lang = ctx.match[1];
        const userId = ctx.from.id;
        const username = ctx.from.username || "Unknown";

        // Save/Update user in D1
        await env.DB.prepare(
          "INSERT INTO users (id, username, language) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET language = EXCLUDED.language"
        )
          .bind(userId, username, lang)
          .run();

        const langStrings = strings[lang] || strings.en;
        const contactKeyboard = new Keyboard()
          .requestContact(langStrings.contact_button)
          .oneTime()
          .resized();

        await ctx.answerCallbackQuery();
        await ctx.reply(langStrings.request_contact, { reply_markup: contactKeyboard });
      });

      // Handle Contact Sharing
      bot.on("message:contact", async (ctx) => {
        const phone = ctx.message.contact.phone_number;
        const userId = ctx.from.id;

        await env.DB.prepare("UPDATE users SET phone_number = ? WHERE id = ?")
          .bind(phone, userId)
          .run();

        const userData = await getUser(ctx);
        const lang = userData?.language || "en";
        await ctx.reply(strings[lang].reg_success, { reply_markup: { remove_keyboard: true } });
      });

      // Admin Broadcast Command
      bot.command("broadcast", async (ctx) => {
        if (ctx.from.id.toString() !== env.ADMIN_ID) {
          return ctx.reply(strings.en.admin_only);
        }
        await ctx.reply("📢 " + strings.en.broadcast_prompt + "\n\n(Tip: Reply to this message with any media or text)");
      });

      // --- 4. Main Message Handler (AI Search & Broadcast Execution) ---
      bot.on("message", async (ctx) => {
        const isAdmin = ctx.from.id.toString() === env.ADMIN_ID;
        const userData = await getUser(ctx);
        const lang = userData?.language || "en";

        // A. Execution of Broadcast (If Admin replies to a broadcast prompt)
        if (isAdmin && ctx.message.reply_to_message && ctx.message.reply_to_message.text.includes("broadcast")) {
          const { results } = await env.DB.prepare("SELECT id FROM users").all();
          let count = 0;

          for (const user of results) {
            try {
              // copyMessage sends any type of message (video, doc, sticker, text)
              await ctx.api.copyMessage(user.id, ctx.chat.id, ctx.message.message_id);
              count++;
            } catch (e) {
              console.log(`Failed to send to ${user.id}`);
            }
          }
          return ctx.reply(strings[lang].broadcast_done.replace("{count}", count));
        }

        // B. AI Search (If user sends plain text)
        if (ctx.message.text && !ctx.message.text.startsWith("/")) {
          const query = ctx.message.text;
          await ctx.reply(strings[lang].search_searching);

          try {
            const searchResponse = await fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: {
                "X-API-KEY": env.SERPER_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ q: query, gl: "et" }), // Search focused on Ethiopia
            });

            const data = await searchResponse.json();
            
            if (data.organic && data.organic.length > 0) {
              // Take the top 3 results
              let responseText = `🔍 **Search Results:**\n\n`;
              data.organic.slice(0, 3).forEach((item, index) => {
                responseText += `${index + 1}. *${item.title}*\n📖 ${item.snippet}\n🔗 [Read More](${item.link})\n\n`;
              });
              
              await ctx.reply(responseText, { parse_mode: "Markdown", disable_web_page_preview: false });
            } else {
              await ctx.reply(strings[lang].search_no_result);
            }
          } catch (err) {
            await ctx.reply("⚠️ Error connecting to search service. Please try again later.");
          }
        }
      });

      // Initialize Webhook
      return webhookCallback(bot, "cloudflare-workers")(request);
    }
    
    return new Response("Bot is active and running on Cloudflare Workers!");
  },
};
        
