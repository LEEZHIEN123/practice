/**
 * Deletes ALL users' workout data with 0 (or missing) kcal (server-side):
 * - workoutLogs: burnedKcal missing or <= 0
 * - workoutSessions: status === "completed" and burnedKcal <= 0
 *
 * Requires a Firebase service account JSON:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccount.json
 *   npm run cleanup:zero-kcal-workouts
 */

const admin = require("firebase-admin");
const fs = require("fs");

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !fs.existsSync(credPath)) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file path.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
}

const db = admin.firestore();

function kcalFromData(data) {
  const raw = data.burnedKcal;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function main() {
  const usersSnap = await db.collection("users").get();
  let totalDeleted = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const refs = [];

    const logsSnap = await db.collection("users").doc(uid).collection("workoutLogs").get();
    for (const d of logsSnap.docs) {
      if (kcalFromData(d.data()) <= 0) refs.push(d.ref);
    }

    const sessSnap = await db.collection("users").doc(uid).collection("workoutSessions").get();
    for (const d of sessSnap.docs) {
      const data = d.data();
      if (data.status !== "completed") continue;
      if (kcalFromData(data) <= 0) refs.push(d.ref);
    }

    for (let i = 0; i < refs.length; i += 500) {
      const batch = db.batch();
      const chunk = refs.slice(i, i + 500);
      chunk.forEach((ref) => {
        batch.delete(ref);
        totalDeleted += 1;
      });
      await batch.commit();
    }
  }

  console.log(`Done. Deleted ${totalDeleted} document(s) (workoutLogs + completed workoutSessions with <= 0 kcal).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
