import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "path";

const globalForWhatsApp = globalThis as unknown as {
  waSocket?: WASocket;
  isConnecting?: boolean;
};

// ফোন নম্বরকে বাংলাদেশি ফরম্যাটে রূপান্তর ও বাংলা ডিজিট ফিল্টার
export function formatToWhatsAppJid(phone: any): string {
  if (!phone) return "";

  let clean = "";
  try {
    const stringPhone = String(phone);
    const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    clean = stringPhone;
    banglaDigits.forEach((digit, index) => {
      clean = clean.split(digit).join(index.toString());
    });
    clean = clean.replace(/\D/g, "");
  } catch (e) {
    return "";
  }

  if (!clean) return "";

  if (clean.startsWith("01") && clean.length === 11) {
    clean = "88" + clean;
  } else if (clean.startsWith("1") && clean.length === 10) {
    clean = "880" + clean;
  }

  return `${clean}@s.whatsapp.net`;
}

// হোয়াটসঅ্যাপ কানেকশন ইনিশিয়ালাইজ করা
export async function connectToWhatsApp(): Promise<WASocket | null> {
  if (globalForWhatsApp.waSocket) {
    return globalForWhatsApp.waSocket;
  }

  if (globalForWhatsApp.isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return globalForWhatsApp.waSocket || null;
  }

  globalForWhatsApp.isConnecting = true;

  try {
    const sessionDir = path.join(process.cwd(), "auth_info_baileys");
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Attendance System", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log(
          "\n📱 WhatsApp QR Code generated! Scan it with your phone:\n",
        );
        qrcode.generate(qr, { small: true });
      }
      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        globalForWhatsApp.waSocket = undefined;
        globalForWhatsApp.isConnecting = false;
        if (shouldReconnect) {
          setTimeout(() => connectToWhatsApp(), 5000);
        }
      } else if (connection === "open") {
        console.log(
          "✅ WhatsApp Connected Successfully for Attendance System!",
        );
        globalForWhatsApp.waSocket = sock;
        globalForWhatsApp.isConnecting = false;
      }
    });

    globalForWhatsApp.waSocket = sock;
    return sock;
  } catch (error) {
    console.error("WhatsApp connection error:", error);
    globalForWhatsApp.isConnecting = false;
    return null;
  }
}

// একক নম্বরে মেসেজ পাঠানোর ফাংশন
export async function sendWhatsAppMessage(
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    if (!phone || !text) return false;
    const jid = formatToWhatsAppJid(phone);

    if (!jid || !jid.includes("@s.whatsapp.net")) {
      console.error(`❌ Invalid JID for phone: ${phone}`);
      return false;
    }

    let retries = 0;
    while (
      (!globalForWhatsApp.waSocket || globalForWhatsApp.isConnecting) &&
      retries < 5
    ) {
      await new Promise((res) => setTimeout(res, 1000));
      retries++;
    }

    let sock = globalForWhatsApp.waSocket;
    if (!sock) {
      sock = await connectToWhatsApp();
    }

    if (!sock) {
      console.error("❌ WhatsApp socket is not ready yet.");
      return false;
    }

    await sock.sendMessage(jid, { text });
    console.log(`✅ WhatsApp message sent successfully to: ${jid}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${phone}:`, error);
    return false;
  }
}

// ডুয়াল নোটিফায়ার: কর্মী, ম্যানেজার ও চেয়ারম্যান সবার কাছে নন-ব্লকিং মেসেজ পাঠানো
export async function notifyAttendance({
  employeePhone,
  managerPhone,
  chairmanPhone,
  employeeMsg,
  managementMsg,
}: {
  employeePhone?: string | null;
  managerPhone?: string | null;
  chairmanPhone?: string | null;
  employeeMsg?: string;
  managementMsg?: string;
}) {
  Promise.resolve().then(async () => {
    // ১. কর্মীকে মেসেজ পাঠানো
    if (employeePhone && employeeMsg) {
      await sendWhatsAppMessage(employeePhone, employeeMsg);
    }
    // ২. ম্যানেজারকে মেসেজ পাঠানো
    if (managerPhone && managementMsg) {
      await sendWhatsAppMessage(managerPhone, managementMsg);
    }
    // ৩. চেয়ারম্যানকে মেসেজ পাঠানো
    if (chairmanPhone && managementMsg) {
      await sendWhatsAppMessage(chairmanPhone, managementMsg);
    }
  });
}
