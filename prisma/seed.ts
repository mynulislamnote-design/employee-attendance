import { PrismaClient, Role, ShiftType, EmploymentType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 সিডিং শুরু হচ্ছে...");

  // ১. ডিফল্ট সিস্টেম সেটিংস তৈরি
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      // আপনার অফিসের আসল Latitude ও Longitude পরে অ্যাডমিন প্যানেল থেকে বদলে নিতে পারবেন
      officeLat: 24.410603, // ঢাকার একটি ডিফল্ট লোকেশন
      officeLng: 88.609189,
      allowedRadius: 100, // ১০০ মিটারের মধ্যে হাজিরা গ্রহণযোগ্য

      // ব্রেক লিমিট
      fullTimeBreakLimit: 60, // ফুল-টাইম: ৬০ মিনিট
      partTimeBreakLimit: 30, // পার্ট-টাইম: ৩০ মিনিট

      // শিফট টাইম
      fullDayStart: "09:00",
      fullDayEnd: "20:00",
      morningStart: "09:00",
      morningEnd: "14:30",
      eveningStart: "14:30",
      eveningEnd: "20:00",

      gracePeriodMinutes: 15,
      managerPhone: "01736738334", // এখানে আপনার আসল হোয়াটসঅ্যাপ নম্বর বসিয়ে নিতে পারেন
    },
  });

  console.log("✅ অফিস সেটিংস সফলভাবে সেভ হয়েছে!");

  // ২. ডিফল্ট অ্যাডমিন ইউজার তৈরি
  const admin = await prisma.user.upsert({
    where: { phone: "01736738334" }, // অ্যাডমিন লগইন ফোন নম্বর
    update: {},
    create: {
      name: "System Admin",
      phone: "01736738334",
      password: "admin", // প্রাথমিক পিন/পাসওয়ার্ড
      role: Role.ADMIN,
      employmentType: EmploymentType.FULL_TIME,
      currentShift: ShiftType.FULL_DAY,
      isActive: true,
    },
  });

  console.log(
    "✅ প্রাথমিক অ্যাডমিন তৈরি হয়েছে:",
    admin.name,
    `(${admin.phone})`,
  );
}

main()
  .catch((e) => {
    console.error("❌ সিডিং এরর:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
