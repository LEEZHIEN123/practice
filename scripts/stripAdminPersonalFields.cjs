/**
 * Removes personal fitness-profile fields from the Support Admin user document.
 * Keeps name, email, role, bio, profileImage, etc.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_PASSWORD="your-admin-password"
 *   node scripts/stripAdminPersonalFields.cjs
 *
 * Uses firebase.config.cjs. Do not commit passwords.
 */

const path = require("path");

const firebaseConfig = require(path.join(__dirname, "..", "firebase.config.cjs"));
const API_KEY = (firebaseConfig.apiKey ?? "").trim();
const PROJECT_ID = (firebaseConfig.projectId ?? "").trim();
const ADMIN_EMAIL = "leezhien12345@gmail.com";

/** Fields that belong to end-user fitness profiles, not the admin account. */
const PERSONAL_FIELDS = [
  "age",
  "height",
  "weight",
  "gender",
  "bmi",
  "bmiCategory",
  "activityLevel",
  "activityMultiplier",
  "dietaryPreference",
  "fitnessGoal",
  "goal",
];

async function authRequest(apiPath, body) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${apiPath}?key=${API_KEY}`, {
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

async function getUserDoc(idToken, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read users/${uid}: ${await res.text()}`);
  return res.json();
}

async function deletePersonalFields(idToken, uid, presentFields) {
  if (presentFields.length === 0) {
    console.log("No personal fields found on the admin document.");
    return;
  }

  const documentName = `projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const body = {
    writes: [
      {
        transform: {
          document: documentName,
          fieldTransforms: presentFields.map((fieldPath) => ({
            fieldPath,
            setToServerValue: undefined,
            // Firestore REST: delete field
            // https://firebase.google.com/docs/firestore/reference/rest/v1/Write#FieldTransform
          })),
        },
      },
    ],
  };

  // FieldTransform "delete" uses empty object with only fieldPath + a delete marker:
  body.writes[0].transform.fieldTransforms = presentFields.map((fieldPath) => ({
    fieldPath,
    // Proto JSON encoding for FieldTransform.delete = {}
    delete: {},
  }));

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const res = await fetch(commitUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Could not strip personal fields: ${await res.text()}`);
  }
  console.log(`Removed from users/${uid}: ${presentFields.join(", ")}`);
}

async function main() {
  if (!API_KEY || !PROJECT_ID) {
    console.error("Set apiKey and projectId in firebase.config.cjs first.");
    process.exit(1);
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Set ADMIN_PASSWORD, e.g. $env:ADMIN_PASSWORD="..." then re-run.');
    process.exit(1);
  }

  const authData = await authRequest("accounts:signInWithPassword", {
    email: ADMIN_EMAIL,
    password,
    returnSecureToken: true,
  });
  const uid = authData.localId;
  console.log(`Signed in as ${ADMIN_EMAIL} (uid: ${uid})`);

  const doc = await getUserDoc(authData.idToken, uid);
  if (!doc) {
    console.log("Admin users/{uid} document does not exist. Nothing to strip.");
    return;
  }

  const existing = new Set(Object.keys(doc.fields || {}));
  const toDelete = PERSONAL_FIELDS.filter((f) => existing.has(f));
  console.log(
    toDelete.length
      ? `Found personal fields: ${toDelete.join(", ")}`
      : "Document has none of the personal fields listed."
  );

  await deletePersonalFields(authData.idToken, uid, toDelete);
  console.log("Done. Refresh Firebase Console → Firestore → users → admin doc to verify.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
