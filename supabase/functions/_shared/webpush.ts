/**
 * Minimal Web Push (RFC 8291 / RFC 8188) over Deno's WebCrypto.
 *
 * The npm `web-push` package leans on Node crypto and doesn't run cleanly on
 * Deno Deploy, and this is the whole of the spec we actually need: a VAPID
 * ES256 JWT plus an aes128gcm-encrypted payload. No dependencies, nothing to
 * keep patched.
 */

const enc = new TextEncoder()

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw], (c) => c.charCodeAt(0))
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

/** RFC 5869 extract-and-expand in one call — exactly what deriveBits does. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/** Signs the VAPID JWT that proves who is sending the push. */
async function vapidHeaders(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<Record<string, string>> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  )
  const unsigned = `${header}.${payload}`

  const pub = b64urlToBytes(publicKey) // uncompressed point: 0x04 || X || Y
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsigned) as BufferSource,
  )

  return {
    Authorization: `vapid t=${unsigned}.${bytesToB64url(new Uint8Array(sig))}, k=${publicKey}`,
  }
}

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}

export interface PushOutcome {
  ok: boolean
  status: number
  /** True when the endpoint is gone for good and the row should be dropped. */
  expired: boolean
}

export async function sendPush(
  sub: PushSubscription,
  payload: unknown,
  vapid: VapidKeys,
): Promise<PushOutcome> {
  const plaintext = enc.encode(JSON.stringify(payload))

  const uaPublic = b64urlToBytes(sub.p256dh)
  const authSecret = b64urlToBytes(sub.auth)

  // Ephemeral key pair for this single message.
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey))

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256),
  )

  // RFC 8291 §3.4 key derivation.
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ])
  // 0x02 is the final-record delimiter; there is only ever one record here.
  const padded = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aesKey,
      padded as BufferSource,
    ),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  const body = concat(
    salt,
    recordSize,
    new Uint8Array([asPublic.length]),
    asPublic,
    ciphertext,
  )

  const audience = new URL(sub.endpoint).origin
  const headers = await vapidHeaders(audience, vapid.subject, vapid.publicKey, vapid.privateKey)

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200',
      Urgency: 'normal',
    },
    body: body as BodyInit,
  })

  return {
    ok: res.ok,
    status: res.status,
    // 404/410 mean the browser threw the subscription away.
    expired: res.status === 404 || res.status === 410,
  }
}
