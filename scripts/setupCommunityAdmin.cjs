/**
 * Creates the community admin Firebase Auth account (one-time setup).
 *
 * Usage:
 *   set ADMIN_PASSWORD=your-password
 *   node scripts/setupCommunityAdmin.cjs
 *
 * Do not commit passwords. The admin email is fixed in firestore.rules / communityService.
 */

const ADMIN_EMAIL = "leezhien12345@gmail.com";
const API_KEY = "AIzaSyBRgSUWNUgTOf4uGrR1yn8XmfvXf5-YCyg";

async function authRequest(path, body) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || "Auth request failed");
    err.code = data?.error?.message;
    throw err;
  }
  return data;
}

async function ensureUserDoc(idToken, localId, name) {
  const projectId = "fitnessapplication-25add";
  const fields = {
    name: { stringValue: name },
    email: { stringValue: ADMIN_EMAIL },
    createdAt: { integerValue: String(Date.now()) },
  };
  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?documentId=${localId}`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (createRes.ok) return;

  const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${localId}?updateMask.fieldPaths=name&updateMask.fieldPaths=email`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { name: fields.name, email: fields.email } }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.text();
    throw new Error(`Could not create user profile: ${err}`);
  }
}

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("Set ADMIN_PASSWORD before running this script.");
    process.exit(1);
  }

  let authData;
  try {
    authData = await authRequest("accounts:signUp", {
      email: ADMIN_EMAIL,
      password,
      returnSecureToken: true,
    });
    console.log("Created admin account.");
  } catch (e) {
    if (e.code === "EMAIL_EXISTS") {
      authData = await authRequest("accounts:signInWithPassword", {
        email: ADMIN_EMAIL,
        password,
        returnSecureToken: true,
      });
      console.log("Admin account already exists. Signed in.");
    } else {
      throw e;
    }
  }

  await ensureUserDoc(authData.idToken, authData.localId, "Support Admin");
  console.log(`Admin ready: ${ADMIN_EMAIL} (uid: ${authData.localId})`);
  console.log("Log in from the app to access the moderation shield icon.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
