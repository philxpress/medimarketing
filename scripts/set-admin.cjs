/**
 * Import a Firebase service-account JSON into .env.local safely.
 *
 * Usage:
 *   node scripts/set-admin.cjs "C:\\path\\to\\medimarketing-...-adminsdk.json"
 *
 * Reads project_id / client_email / private_key from the JSON and writes the
 * FIREBASE_ADMIN_* vars into .env.local. The private key never touches the
 * terminal output — only a confirmation is printed.
 */
const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/set-admin.cjs "<path-to-serviceAccount.json>"');
  process.exit(1);
}
if (!fs.existsSync(jsonPath)) {
  console.error("File not found: " + jsonPath);
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
} catch (e) {
  console.error("Could not parse JSON: " + e.message);
  process.exit(1);
}

for (const f of ["project_id", "client_email", "private_key"]) {
  if (!sa[f]) {
    console.error(`Missing "${f}" — is this a Firebase service-account key file?`);
    process.exit(1);
  }
}

// Store the private key on one line with literal \n; admin.ts converts it back.
const escapedKey = sa.private_key.replace(/\n/g, "\\n");
const vals = {
  FIREBASE_ADMIN_PROJECT_ID: sa.project_id,
  FIREBASE_ADMIN_CLIENT_EMAIL: sa.client_email,
  FIREBASE_ADMIN_PRIVATE_KEY: `"${escapedKey}"`,
};

const envPath = path.join(process.cwd(), ".env.local");
let s = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
for (const [k, v] of Object.entries(vals)) {
  const re = new RegExp("^" + k + "=.*", "m");
  if (re.test(s)) s = s.replace(re, k + "=" + v);
  else s += (s.endsWith("\n") || s === "" ? "" : "\n") + k + "=" + v + "\n";
}
fs.writeFileSync(envPath, s);

console.log("✓ Wrote FIREBASE_ADMIN_* to .env.local");
console.log("  project:      " + sa.project_id);
console.log("  client_email: " + sa.client_email);
console.log("  private_key:  [hidden, " + sa.private_key.length + " chars]");
console.log("\nNext: delete the JSON file, then run `npm run check:firebase`.");
