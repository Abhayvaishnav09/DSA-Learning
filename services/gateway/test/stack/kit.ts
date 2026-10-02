import { deflateSync } from 'node:zlib';
import {
  createClient,
  httpTransport,
  memoryTokenStore,
  type ApiClient,
} from '@logicpath/api-client';
import type { ContentBundle } from '@logicpath/content-schema';
import { ENDPOINTS, type EndpointId, type identity } from '@logicpath/contracts';
import { correctAnswer } from '@logicpath/grader';

/** Where the stack under test is: the gateway, and (locally) the mail catcher. */
export const BASE = process.env.STACK_URL ?? 'http://127.0.0.1:8080';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@logicpath.dev',
  password: process.env.ADMIN_PASSWORD ?? 'admin-password-1',
};

/** One person using the app: their own tokens, and every call checked against the contract. */
export class Actor {
  readonly tokens = memoryTokenStore();
  readonly client: ApiClient = createClient(
    httpTransport({ baseUrl: BASE, tokens: this.tokens, client: 'mobile' }),
  );
  user: identity.User | null = null;

  /** Calls an endpoint, then checks the answer against the shared table like a generated client would. */
  call: ApiClient['call'] = async (id, ...args) => {
    const result = await this.client.call(id, ...(args as never));
    const parsed = ENDPOINTS[id as EndpointId].response.safeParse(result);
    if (!parsed.success) {
      throw new Error(
        `${String(id)}: the answer does not match the contract: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
      );
    }
    return result as never;
  };

  async signIn(email: string, password: string) {
    const session = await this.client.call('auth.login', { body: { email, password } });
    this.tokens.save(session.tokens);
    this.user = session.user;
    return this;
  }
}

export const uniqueEmail = (label: string) =>
  `${label}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

/** A new adult learner, signed in. */
export async function newLearner(label = 'learner', name = 'Stack Learner'): Promise<Actor> {
  const actor = new Actor();
  const email = uniqueEmail(label);
  const result = await actor.call('auth.register', {
    body: { email, password: 'stack-password-1', name, birthYear: 1995, locale: 'en' },
  });
  if (result.status !== 'active') throw new Error('an adult should be active at once');
  actor.tokens.save(result.tokens);
  actor.user = result.user;
  return actor;
}

export async function admin(): Promise<Actor> {
  return new Actor().signIn(ADMIN.email, ADMIN.password);
}

/** Polls until `check` returns something truthy: other services catch up a moment after the call returns. */
export async function eventually<T>(
  check: () => Promise<T | undefined | null | false>,
  { timeoutMs = 20_000, intervalMs = 250, what = 'the condition' } = {},
): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `${what} did not become true in ${timeoutMs} ms${last ? `: ${String(last)}` : ''}`,
  );
}

export async function liveBundle(): Promise<ContentBundle> {
  const response = await fetch(`${BASE}/v1/content/bundle`);
  if (!response.ok) throw new Error(`bundle: ${response.status}`);
  return (await response.json()) as ContentBundle;
}

/** The answer that is right for an item, with the "why" pick when the question asks one. */
export function rightAnswer(item: ContentBundle['items'][string]) {
  return {
    answer: correctAnswer(item),
    explainOption: item.explainWhy ? item.explainWhy.options.findIndex((o) => o.correct) : null,
  };
}

export const attemptId = () => crypto.randomUUID();

// ---------- people with a role ----------

/** An account an admin creates for staff: a writer or another admin. */
export async function newStaff(
  boss: Actor,
  role: 'writer' | 'admin',
  label: string = role,
  name: string = `Stack ${role}`,
): Promise<Actor> {
  const email = uniqueEmail(label);
  const password = 'stack-password-1';
  const user = await boss.call('admin.users.create', { body: { email, name, role, password } });
  if (user.role !== role) throw new Error(`expected a ${role}, got ${user.role}`);
  return new Actor().signIn(email, password);
}

// ---------- the mail catcher ----------

export const mailAvailable = await fetch(`${MAILPIT}/api/v1/info`, {
  signal: AbortSignal.timeout(2_000),
})
  .then((r) => r.ok)
  .catch(() => false);

/** The text of the newest mail to an address, once it has arrived. */
export async function mailTo(address: string, subject?: RegExp): Promise<string> {
  return eventually(
    async () => {
      const found = (await (
        await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
      ).json()) as { messages?: { ID: string; Subject: string }[] };
      const message = (found.messages ?? []).find((m) => !subject || subject.test(m.Subject));
      if (!message) return null;
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      return full.Text;
    },
    { what: `a mail to ${address}`, timeoutMs: 30_000 },
  );
}

// ---------- a picture to upload ----------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A real PNG (a colour gradient), made by hand so the test needs no image library. */
export function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB, no interlace
  const rows = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const at = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      rows[at + 1 + x * 3] = Math.round((x / width) * 255);
      rows[at + 2 + x * 3] = Math.round((y / height) * 255);
      rows[at + 3 + x * 3] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A request without the typed client, for what is not part of the app's own API. */
export const raw = (path: string, init?: RequestInit) => fetch(`${BASE}${path}`, init);
