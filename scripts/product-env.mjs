import fs from "node:fs";
import path from "node:path";

// Next.js loads .env.local for its server, but standalone Node workers do not.
const envPath = process.env.PRODUCT_ENV_FILE || path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const entries = [];
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) entries.push([match[1], parseValue(match[2])]);
  }
  // Local desktop sessions can inherit an unrelated OPENAI_API_KEY from the
  // host. Opt in to this project's values in that case. Deployment secret
  // stores retain precedence unless this explicit local flag is set.
  const forceProjectValues = entries.some(([name, value]) => name === "PRODUCT_ENV_FILE_OVERRIDE" && value.toLowerCase() === "true");
  for (const [name, value] of entries) {
    if (!forceProjectValues && Object.hasOwn(process.env, name)) continue;
    process.env[name] = value;
  }
}

function parseValue(raw) {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  const comment = raw.search(/\s#/);
  return (comment === -1 ? raw : raw.slice(0, comment)).trim();
}
