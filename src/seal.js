// Alice in AI Land - sealed stages.
//
// A stage on the site is a plain data object (stages/*.js). A *sealed* stage
// is that object encrypted so that only a badge opens it: the site is static
// files anyone can fetch, the repository is public, so the one thing a
// crawler cannot have is a secret that lives on the badge. src/vault.js gets
// that secret out; this module turns it into the stage.
//
//   sealed JSON  { sealed: 1, id, kdf: "HKDF-SHA256", salt, iv, ct }
//   stage key    HKDF-SHA256(ikm = badge key, salt, info = "alice-in-ai-land/stage/" + id)
//   ciphertext   AES-256-GCM(stage key, iv, plaintext = JSON of the stage, aad = id)
//
// Per-stage derivation means a stage's key never equals the badge key and a
// future server tier can hand a client one stage's key without the rest.
// GCM means a flipped byte is a refusal, not a corrupt map.
//
// Same code in the browser and in Node (globalThis.crypto.subtle in both):
// software/tools/seal-stage.mjs seals, the page unseals, verify-badge.mjs
// proves they agree.

const INFO_PREFIX = 'alice-in-ai-land/stage/';
const subtle = () => globalThis.crypto?.subtle ?? (() => { throw new Error('WebCrypto is not available here'); })();

const utf8 = (s) => new TextEncoder().encode(s);
const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], h => parseInt(h, 16));
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** The AES-GCM key for one stage, derived from the badge key. */
export async function deriveStageKey(badgeKey, salt, id) {
  if (!(badgeKey instanceof Uint8Array) || badgeKey.length !== 32) throw new Error('badge key must be 32 bytes');
  const ikm = await subtle().importKey('raw', badgeKey, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(INFO_PREFIX + id) },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Seal a stage object under the badge key. `id` names the stage (its file name without .js). */
export async function seal(stage, badgeKey, id) {
  if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error('stage id must be lowercase letters, digits and dashes');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveStageKey(badgeKey, salt, id);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(id) }, key, utf8(JSON.stringify(stage)));
  return { sealed: 1, id, kdf: 'HKDF-SHA256', salt: hex(salt), iv: hex(iv), ct: b64(new Uint8Array(ct)) };
}

/** Open a sealed stage. Throws on the wrong key, a tampered blob or an unknown format. */
export async function unseal(blob, badgeKey) {
  if (!blob || blob.sealed !== 1 || blob.kdf !== 'HKDF-SHA256') throw new Error('not a sealed stage');
  if (!badgeKey) throw new Error('this stage is sealed: it needs the key from the badge');
  const key = await deriveStageKey(badgeKey, unhex(blob.salt), blob.id);
  let pt;
  try {
    pt = await subtle().decrypt({ name: 'AES-GCM', iv: unhex(blob.iv), additionalData: utf8(blob.id) }, key, unb64(blob.ct));
  } catch {
    throw new Error(`the badge's key does not open "${blob.id}"`);
  }
  return JSON.parse(new TextDecoder().decode(pt));
}

export const isSealed = (blob) => !!blob && blob.sealed === 1;

// stages/sealed.json lists the ids that are published sealed; seal-stage.mjs
// keeps it. One fetch per page, no probing, no 404 in the console.
let manifest = null;
const sealedIds = (base) => (manifest ??= fetch(`${base}sealed.json`, { cache: 'no-cache' })
  .then(r => r.ok ? r.json() : { sealed: [] })
  .then(m => new Set(m.sealed ?? []))
  .catch(() => new Set()));

/**
 * A stage by id, for a page: the sealed copy under stages/sealed/ when the
 * manifest lists it, else the plain module under stages/. `badgeKey` is the
 * 32-byte key from src/vault.js, or null when there is no badge - then a
 * sealed stage is a refusal and a plain one still loads.
 */
export async function loadStage(id, badgeKey, { base = 'stages/' } = {}) {
  if ((await sealedIds(base)).has(id)) {
    const r = await fetch(`${base}sealed/${id}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`stages/sealed/${id}.json: ${r.status}`);
    return unseal(await r.json(), badgeKey);
  }
  const mod = await import(`../${base}${id}.js`);
  const stage = Object.values(mod)[0];
  if (!stage) throw new Error(`stages/${id}.js exports nothing`);
  return stage;
}
