import { Context, Config } from './interfaces';
import cache from './cache';

import * as middleware from './middleware';
import * as commands from './commands';
import * as permissions from './permissions';
import * as inline from './inline';
import * as text from './text';
import * as files from './files';
import * as error from './error';

import * as webserver from './addons/web';
import * as signal from './addons/signal';
import TelegramAddon from './addons/telegram';

let defaultBot: TelegramAddon;

/**
 * Create Bot
 * @return {Bot}
 */
function createBot() {
  if (cache.config != null && cache.config.bot_token != null) {
    if (cache.config.bot_token == 'YOUR_BOT_TOKEN') {
      console.error('Please change your bot token in config/config.yaml');
      process.exit(1);
    }
    defaultBot = new TelegramAddon(cache.config.bot_token);
  }
  cache.config.autoreply_confirmation = cache.config.autoreply_confirmation === undefined ? true : cache.config.autoreply_confirmation
  cache.config.language.confirmationMessage = cache.config.language.confirmationMessage || cache.config.language.contactMessage // left for backward compatibility
  cache.config.clean_replies = cache.config.clean_replies === undefined ? false : cache.config.clean_replies // left for backward compatibility
  cache.config.pass_start = cache.config.pass_start === undefined ? false : cache.config.pass_start // left for backward compatibility


  return defaultBot;
}

/**
 * Main function
 * @param {TelegramAddon} bot
 * @param {boolean} logs
 */
function main(bot: TelegramAddon = defaultBot, logs = true) {
  cache.bot = defaultBot;
  // bot.sendMessage(cache.config.staffchat_id, 'Bot started');
  // Check addon
  if (cache.config.signal_enabled) {
    signal.init(function (ctx: Context, msg: any[]) {
      console.log(msg);
      text.handleText(bot, ctx, msg);
    });
  }

  // Start webserver
  if (cache.config.web_server) {
    webserver.init(bot);
  }
  // Init error handling
  error.init(logs);

  // Use session and check for permissions on message
  bot.use(bot.initSession());

  bot.use((ctx: Context, next: () => any) => {
    // Check dev mode
    if (cache.config.dev_mode) {
      middleware.reply(
        ctx,
        `_Dev mode is on: You might notice 
      some delay in messages, no replies or other errors._`,
        { parse_mode: cache.config.parse_mode },
      );
    }
    permissions.checkPermissions(ctx, next, cache.config);
  });

  // Init category keys
  const keys = inline.initInline(bot);

  // Set bots username
  // bot..getMe().then((botInfo) => bot.options.username = botInfo.username);

  // Bot commands

  bot.bot.api.setMyCommands(
    [
      { command: "start", description: "Начать работу с ботом" },
      { command: "faq", description: "Часто задаваемые вопросы" },
      { command: "id", description: "Посмотреть мой Telegram ID" },
    ],
    {
      scope: { type: "default" },
    }
  );

  bot.bot.api.setMyCommands(
    [
      { command: "open", description: "Показать открытые тикеты" },
      { command: "close", description: "Закрыть тикет" },
      { command: "ban", description: "Заблокировать пользователя" },
      { command: "unban", description: "Разблокировать пользователя" },
      { command: "reopen", description: "Переоткрыть тикет" },
      { command: "clear", description: "Очистить чат" },
      { command: "id", description: "Посмотреть ID" },
    ],
    {
      scope: { type: "all_chat_administrators" },
    }
  );

  // const workingHours = { start: 10, end: 19 }; // Часы работы

  // bot.on("message", async (ctx) => {
  //   const now = new Date();
  //   const hour = now.getHours();

  //   if (hour < workingHours.start || hour >= workingHours.end) {
  //     await ctx.reply(
  //       "Мы сейчас не работаем. Ответим в рабочее время (09:00 - 18:00)."
  //     );
  //   } else {
  //     // Основная логика бота
  //   }
  // });

  bot.hears(["цена", "оплата", "сколько стоит"], async (ctx) => {
    await ctx.reply(
      "Актуальные тарифы можно посмотреть на сайте: https://karvpn.ru/pricing"
    );
  });

  // bot.bot.api.setChatMenuButton({
  //   menu_button: {
  //     type: "commands",
  //   },
  // });

  // bot.command("rate", async (ctx) => {
  //   await ctx.reply("Оцените нашу работу:", {
  //     reply_markup: {
  //       inline_keyboard: [
  //         [{ text: "⭐️ 1", callback_data: "rate_1" }],
  //         [{ text: "⭐️⭐️ 2", callback_data: "rate_2" }],
  //         [{ text: "⭐️⭐️⭐️ 3", callback_data: "rate_3" }],
  //         [{ text: "⭐️⭐️⭐️⭐️ 4", callback_data: "rate_4" }],
  //         [{ text: "⭐️⭐️⭐️⭐️⭐️ 5", callback_data: "rate_5" }],
  //       ],
  //     },
  //   });
  // });

  bot.on("callback_query:data", async (ctx) => {
    if (ctx.callbackQuery.data.startsWith("rate_")) {
      const rating = ctx.callbackQuery.data.replace("rate_", "");
      await ctx.answerCallbackQuery(`Спасибо за вашу оценку: ${rating} ⭐️`);
    }
  });
  bot.command("open", (ctx: Context) => commands.openCommand(ctx));
  bot.command("close", (ctx: Context) => commands.closeCommand(ctx));
  bot.command("ban", (ctx: Context) => commands.banCommand(ctx));
  bot.command("reopen", (ctx: Context) => commands.reopenCommand(ctx));
  bot.command("unban", (ctx: Context) => commands.unbanCommand(ctx));
  bot.command("clear", (ctx: Context) => commands.clearCommand(ctx));
  bot.command("id", (ctx: Context) =>
    middleware.reply(ctx, `User ID: ${ctx.from.id}\nGroup ID: ${ctx.chat.id}`, {
      parse_mode: cache.config.parse_mode,
    })
  );
  bot.command("faq", (ctx: Context) =>
    middleware.reply(ctx, cache.config.language.faqCommandText, {
      parse_mode: cache.config.parse_mode,
    })
  );
  bot.command("help", (ctx: Context) => commands.helpCommand(ctx));
  bot.command("links", (ctx: Context) => {
    let links = "";
    const subcategories = [];
    for (const i in cache.config.categories) {
      if (i !== undefined) {
        for (const j in cache.config.categories[i].subgroups) {
          if (j !== undefined) {
            const catName = cache.config.categories[i].subgroups[j].name;
            const id = (
              cache.config.categories[i].name +
              cache.config.categories[i].subgroups[j].name
            )
              .replace(/[\[\]\:\ "]/g, '')
              .substring(0, 63);
            if (subcategories.indexOf(id) == -1) {
              subcategories.push(id);
              if (bot.botInfo != null) {
                links += `${catName} - https://t.me/${bot.botInfo.username}?start=${id}\n`;
              }
            }
          }
        }
      }
    }
    middleware.reply(ctx, `${cache.config.language.links}:\n${links}`, {
      parse_mode: cache.config.parse_mode,
    });
  });

  if (cache.config.pass_start == false) {
    bot.command('start', (ctx: Context) => {
      if (ctx.chat.type == 'private') {
        middleware.reply(ctx, cache.config.language.startCommandText);
        if (cache.config.categories && cache.config.categories.length > 0) {
          setTimeout(
            () =>
              middleware.reply(
                ctx,
                cache.config.language.services,
                inline.replyKeyboard(keys),
              ),
            500,
          );
        }
      } else middleware.reply(ctx, cache.config.language.prvChatOnly);
    });
  }

  // Bot ons
  bot.on('callback_query', (ctx: Context) => inline.callbackQuery(ctx));
  bot.on([':photo'], (ctx: Context) => files.fileHandler('photo', bot, ctx));
  bot.on([':video'], (ctx: Context) => files.fileHandler('video', bot, ctx));
  bot.on([':document'], (ctx: Context) =>
    files.fileHandler('document', bot, ctx),
  );

  // Bot regex
  bot.hears(cache.config.language.back, (ctx: Context) =>
    middleware.reply(
      ctx,
      cache.config.language.services,
      inline.replyKeyboard(keys),
    ),
  );
  bot.hears('testing', (ctx: Context) => text.handleText(bot, ctx, keys));
  bot.hears(/(.+)/, (ctx: Context) => {
    text.handleText(bot, ctx, keys);
  });

  // Catch bot errors
  bot.catch((err: any, ctx: Context) => {
    console.log('Error: ', err);
    // Catch bot blocked by user
    try {
      middleware.reply(ctx, 'Message is not sent due to an error.');
    } catch (e) {
      console.log('Could not send error msg to chat: ', e);
    }
  });

  if (logs) {
    bot.start();
  }
}

createBot();
main();

export { createBot, main };
