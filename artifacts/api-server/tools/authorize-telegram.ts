/**
 * Run only in the owner's private terminal. Never through an API endpoint or chat.
 * Handles 2FA locally without exposing a Telegram password or serialized session.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { Logger, LogLevel } from "teleproto/extensions/Logger.js";
import { encrypt } from "../src/lib/auth";
import { pool, setSetting, safeError } from "../src/lib/store";

if (!process.stdin.isTTY) throw new Error("يلزم طرفية تفاعلية خاصة بالمالك");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("يلزم SESSION_SECRET آمن");
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) {
  if (!muted) process.stdout.write(chunk);
  callback();
} });
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function prompt(label: string, secret = false) {
  process.stdout.write(label);
  muted = secret;
  try { return (await rl.question("")).trim(); } finally { muted = false; process.stdout.write("\n"); }
}
const client = new TelegramClient(new StringSession(""), Number(process.env.API_ID), process.env.API_HASH!, {
  connectionRetries: 5, baseLogger: new Logger(LogLevel.NONE),
});
try {
  process.stdout.write("تفويض Telegram محلياً. لا ترسل أي قيمة إلى المحادثة. المدخلات الحساسة لن تظهر.\n");
  await client.start({
    phoneNumber: () => prompt("رقم الهاتف الدولي: ", true),
    phoneCode: () => prompt("رمز التحقق من تطبيق Telegram: ", true),
    password: () => prompt("كلمة مرور التحقق بخطوتين (محلياً فقط): ", true),
    onError: () => { throw new Error("فشل التفويض؛ راجع بيانات التطبيق ثم أعد المحاولة"); },
  });
  await setSetting("telegram_session", encrypt(client.session.save() as unknown as string));
  process.stdout.write("تم حفظ الجلسة مشفرة في قاعدة البيانات. أعد تشغيل الخدمة أو انتظر دورة إعادة الاتصال.\n");
} catch (error) {
  process.stderr.write(`${safeError(error)}\n`);
  process.exitCode = 1;
} finally {
  rl.close(); await client.disconnect(); await pool.end();
}
