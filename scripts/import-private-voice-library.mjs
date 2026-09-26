/**
 * One-time private voice import.
 *
 * Required environment variables:
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * CHATSCENE_VOICE_SERVICE_URL (or CLEANER_WORKER_PUBLIC_URL),
 * CHATSCENE_VOICE_SERVICE_SECRET (or CLEANER_WORKER_SECRET).
 *
 * Usage:
 * node scripts/import-private-voice-library.mjs --directory "C:\\path\\voices" --emails "one@example.com,two@example.com"
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const directory = argument("directory");
const emails = (argument("emails") ?? "")
  .split(",")
  .map((email) => email.trim().toLocaleLowerCase("en-US"))
  .filter(Boolean);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const voiceUrl = (
  process.env.CHATSCENE_VOICE_SERVICE_URL ?? process.env.CLEANER_WORKER_PUBLIC_URL
)?.replace(/\/+$/, "");
const voiceSecret = process.env.CHATSCENE_VOICE_SERVICE_SECRET ?? process.env.CLEANER_WORKER_SECRET;

if (!directory || !emails.length) throw new Error("Informe --directory e --emails.");
if (!supabaseUrl || !serviceRole)
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
if (!voiceUrl || !voiceSecret || voiceSecret.length < 32)
  throw new Error("Configure o serviço privado de voz.");

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUsers(wanted) {
  const found = new Map();
  for (let page = 1; page <= 100 && found.size < wanted.length; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.toLocaleLowerCase("en-US");
      if (email && wanted.includes(email)) found.set(email, user.id);
    }
    if (data.users.length < 1000) break;
  }
  const missing = wanted.filter((email) => !found.has(email));
  if (missing.length) throw new Error(`Contas não encontradas: ${missing.join(", ")}`);
  return found;
}

async function voiceRequest(path, init) {
  const response = await fetch(`${voiceUrl}/v1/voice${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${voiceSecret}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.detail ?? `Serviço de voz retornou ${response.status}.`);
  return result;
}

const users = await findUsers(emails);
const files = (await readdir(resolve(directory), { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      [".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(extname(entry.name).toLowerCase()),
  )
  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
if (!files.length) throw new Error("Nenhum áudio compatível encontrado.");

let imported = 0;
let skipped = 0;
for (const [email, userId] of users) {
  const { data: existing, error: existingError } = await supabase
    .from("voice_reference_profiles")
    .select("name")
    .eq("user_id", userId);
  if (existingError) throw existingError;
  const names = new Set((existing ?? []).map((row) => row.name));
  for (const entry of files) {
    const name = basename(entry.name, extname(entry.name)).trim().slice(0, 100);
    if (names.has(name)) {
      skipped += 1;
      continue;
    }
    const audio = await readFile(resolve(directory, entry.name));
    const digest = createHash("sha256").update(audio).digest("hex");
    const reference = await voiceRequest("/references", {
      method: "POST",
      body: JSON.stringify({ userId, audio: audio.toString("base64") }),
    });
    const { error } = await supabase.from("voice_reference_profiles").insert({
      id: reference.id,
      user_id: userId,
      name,
      duration_sec: reference.durationSec,
      authorization_version: "adult-own-or-written-1",
    });
    if (error) {
      await voiceRequest("/references", {
        method: "DELETE",
        body: JSON.stringify({ userId, referenceId: reference.id }),
      }).catch(() => undefined);
      throw error;
    }
    imported += 1;
    names.add(name);
    process.stdout.write(`Importada ${name} para ${email} (${digest.slice(0, 12)}).\n`);
  }
}
process.stdout.write(`Concluído: ${imported} importações; ${skipped} já existentes.\n`);
