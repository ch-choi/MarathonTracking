const MAX_BODY_BYTES = 16 * 1024;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const EVENT_IDS = new Set(["myresult-176", "myresult-177"]);

function response(body, status, request, env) {
  const origin = request.headers.get("Origin");
  const configured = String(env.ALLOWED_ORIGINS || "*").split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = configured.includes("*") ? "*" : (origin && configured.includes(origin) ? origin : configured[0] || "null");
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  if (allowOrigin !== "*") headers.set("Vary", "Origin");
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function fail(code, status, request, env) {
  return response({ error: code }, status, request, env);
}

function eventId(value) {
  const id = String(value ?? "").trim();
  if (/^(176|177)$/.test(id)) return `myresult-${id}`;
  return EVENT_IDS.has(id) ? id : null;
}

function bibs(value, allowEmpty = false) {
  if (!Array.isArray(value) || value.length > 50 || (!allowEmpty && value.length === 0)) return null;
  const list = value.map((item) => String(item).trim());
  if (list.some((item) => !/^\d{1,8}$/.test(item))) return null;
  return new Set(list).size === list.length ? list : null;
}

function names(value, knownBibs) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [bib, raw] of Object.entries(value)) {
    if (!knownBibs.includes(bib) || typeof raw !== "string") return null;
    const name = raw.trim();
    if (Array.from(name).length > 60) return null;
    if (name) result[bib] = name;
  }
  return result;
}

function token() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function suppliedToken(body, fields) {
  for (const field of fields) {
    if (typeof body[field] === "string" && TOKEN_PATTERN.test(body[field])) return body[field];
  }
  return null;
}

function payload(value) {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object" || typeof item.eventId !== "string" || !Array.isArray(item.bibs)) return null;
  return { eventId: item.eventId, bibs: item.bibs, names: item.names && typeof item.names === "object" ? item.names : {}, expiresAt: item.expiresAt };
}

async function rpc(env, fetchImpl, values) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const base = String(env.SUPABASE_URL || env.SUPABASE_PROJECT_URL || "").replace(/\/$/, "");
  if (!key || !base) throw new Error("missing server configuration");
  const result = await fetchImpl(`${base}/rest/v1/rpc/tracking_list_access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(values),
  });
  if (!result.ok) throw new Error("database request failed");
  return result.json();
}

async function bodyOf(request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export const createHandler = (env = {}, fetchImpl = fetch) => async (request) => {
  if (request.method === "OPTIONS") return response({}, 204, request, env);
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405, request, env);
  let body;
  try {
    body = await bodyOf(request);
  } catch {
    return fail("INVALID_REQUEST", 400, request, env);
  }
  if (!body || typeof body.action !== "string" || !["create", "read", "update", "revoke"].includes(body.action)) return fail("INVALID_REQUEST", 400, request, env);
  const action = body.action;
  try {
    if (action === "create") {
      const id = eventId(body.eventId);
      const list = bibs(body.bibs);
      const displayNames = names(body.names ?? body.displayNames ?? {}, list || []);
      if (!id || !list || displayNames === null) return fail("INVALID_REQUEST", 400, request, env);
      const readToken = token();
      const editToken = token();
      const result = payload(await rpc(env, fetchImpl, {
        p_action: "create", p_read_hash: await hash(readToken), p_edit_hash: await hash(editToken),
        p_event_id: id, p_bibs: list, p_names: displayNames,
      }));
      return result ? response({ token: readToken, editToken, ...result }, 200, request, env) : fail("DATABASE_ERROR", 502, request, env);
    }

    const rawToken = action === "read" ? suppliedToken(body, ["token", "readToken"]) : suppliedToken(body, ["editToken"]);
    if (!rawToken) return fail("INVALID_REQUEST", 400, request, env);
    const credentials = action === "read" ? { p_read_hash: await hash(rawToken) } : { p_edit_hash: await hash(rawToken) };
    if (action === "read") {
      const result = payload(await rpc(env, fetchImpl, { p_action: "read", ...credentials }));
      return result ? response(result, 200, request, env) : fail("NOT_FOUND", 404, request, env);
    }
    if (action === "revoke") {
      const result = await rpc(env, fetchImpl, { p_action: "revoke", ...credentials });
      return (Array.isArray(result) ? result[0] : result)?.ok ? response({ ok: true }, 200, request, env) : fail("NOT_FOUND", 404, request, env);
    }

    if (body.eventId === undefined || body.bibs === undefined || body.names === undefined && body.displayNames === undefined) return fail("INVALID_REQUEST", 400, request, env);
    const id = eventId(body.eventId);
    const list = bibs(body.bibs, true);
    const displayNames = names(body.names ?? body.displayNames, list || []);
    if (!id || !list || displayNames === null) return fail("INVALID_REQUEST", 400, request, env);
    const result = payload(await rpc(env, fetchImpl, { p_action: "update", ...credentials, p_event_id: id, p_bibs: list, p_names: displayNames }));
    return result ? response(result, 200, request, env) : fail("NOT_FOUND", 404, request, env);
  } catch {
    return fail("DATABASE_ERROR", 502, request, env);
  }
};

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(createHandler(Deno.env.toObject(), fetch));
