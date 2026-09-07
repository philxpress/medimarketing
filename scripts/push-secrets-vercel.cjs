/**
 * Push the server-side secrets from .env.local to Vercel, then redeploy.
 *
 * Fixes the live "Missing Firebase Admin credentials" 401: the admin vars in
 * Vercel were empty/malformed (the multi-line private key breaks on import).
 * This reads the known-good values from your local .env.local and re-adds them.
 *
 * They are pushed as NON-sensitive so they reliably reach the runtime on this
 * project (this team defaults vars to Sensitive, which was not being injected).
 * They still have NO public prefix, so they are NEVER exposed to the browser —
 * only readable by you in the Vercel dashboard.
 *
 * Run:  node scripts/push-secrets-vercel.cjs
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const VARS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "TOKEN_ENCRYPTION_KEY",
];
const ENVS = ["production", "preview", "development"];

if (!fs.existsSync(".env.local")) {
  console.error("✗ .env.local not found. Run from the project root.");
  process.exit(1);
}
const raw = fs.readFileSync(".env.local", "utf8");

function readRaw(key) {
  // Read the raw line and strip ONE layer of surrounding double quotes.
  // Keeps literal \n inside the private key intact (admin.ts converts them).
  const m = raw.match(new RegExp("^" + key + "=(.*)$", "m"));
  if (!m) return null;
  let v = m[1];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function vercel(args, input) {
  return execFileSync("npx", ["--no-install", "vercel", ...args], {
    // Pass secret values via stdin (never as argv) to avoid shell mangling.
    input: input != null ? input : undefined,
    // Capture stderr so failures are visible (but never echo the value).
    stdio: input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

console.log("Pushing server secrets to Vercel (values from .env.local)…\n");
for (const key of VARS) {
  const value = readRaw(key);
  if (value == null || value === "") {
    console.log(`  ⚠ ${key} missing in .env.local — skipped`);
    continue;
  }
  for (const env of ENVS) {
    try {
      vercel(["env", "rm", key, env, "-y"]);
    } catch {}
    try {
      // Value goes via stdin, not argv — safe for the multi-line private key.
      vercel(["env", "add", key, env, "--no-sensitive", "--force", "--yes"], value);
      console.log(`  ✓ ${key} [${env}]`);
    } catch (e) {
      const detail = (e.stderr || e.message || String(e)).toString().split("\n").filter(Boolean).pop();
      console.log(`  ✗ ${key} [${env}] — ${detail}`);
    }
  }
}

console.log("\nTriggering a production redeploy…");
try {
  execFileSync("npx", ["--no-install", "vercel", "--prod", "--force", "--yes"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} catch {
  console.log("Redeploy command finished (check output above).");
}
console.log("\nDone. Reload https://medimarketing-one.vercel.app/login and try signing in.");
