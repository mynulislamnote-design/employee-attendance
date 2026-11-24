export async function register() {
  // শুধুমাত্র Node.js সার্ভার রানটাইমে হোয়াটসঅ্যাপ কানেক্ট হবে
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { connectToWhatsApp } = await import("./lib/whatsapp");
    console.log("🚀 Initializing WhatsApp Engine from instrumentation...");
    await connectToWhatsApp();
  }
}
