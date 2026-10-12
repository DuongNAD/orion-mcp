/**
 * Vega inbox producer for contract `vega-card-inbox.v1`.
 *
 * One adaptive review queue: Orion never writes Vega's cards or reviews. It drops card candidates into
 * `<hub>/.vega/inbox/` as one new file per batch; Vega alone validates, deduplicates (by `key`) and schedules them.
 *
 *   file name : orion-<YYYYMMDDTHHmmss>-<6 lowercase hex>.jsonl   (UTC)
 *   write     : <name>.jsonl.tmp in the same folder, then rename; never append to or rewrite an existing file
 *   line      : see VegaInboxLineSchema (unknown fields are rejected)
 */
import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import {
  formatZodErrors,
  type ExportCardSource,
  type VegaCardCandidate,
  type VegaInboxOutcome,
} from "./schema.js";
import { clip, toPosix } from "./util.js";

export const VEGA_INBOX_VERSION = 1;
export const DEFAULT_HUB = "D:/02_Learning_Knowledge";
export const INBOX_PRODUCER = "orion";

export const INBOX_PRODUCERS = ["polaris", "orion", "mira", "aurora", "sirius", "manual"] as const;
export const INBOX_ORIGIN_KINDS = [
  "polaris-fact",
  "polaris-errorlog",
  "polaris-selfcheck",
  "aurora-quiz",
  "aurora-predict",
  "orion-attempt",
  "mira-stop",
  "manual",
] as const;
export const INBOX_CARD_KINDS = ["basic", "cloze", "reverse"] as const;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const EMOJI = /\p{Extended_Pictographic}/u;

export const VegaInboxLineSchema = z.strictObject({
  v: z.literal(VEGA_INBOX_VERSION),
  t: z.string().regex(ISO_DATE_TIME, "t must be an ISO 8601 date-time with offset or Z"),
  producer: z.enum(INBOX_PRODUCERS),
  key: z.string().min(1).max(200),
  subject: z.string().min(1).max(120),
  deck: z.string().max(120).optional(),
  kind: z.enum(INBOX_CARD_KINDS).optional(),
  front: z.string().min(1).max(600),
  back: z.string().max(1200),
  hint: z.string().max(200).optional(),
  hook: z.string().max(200).optional(),
  origin: z.strictObject({
    kind: z.enum(INBOX_ORIGIN_KINDS),
    path: z.string().min(1).max(400),
    locator: z.string().max(120).optional(),
    href: z.string().max(400).optional(),
  }),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  reason: z.string().max(200).optional(),
});
export type VegaInboxLine = z.output<typeof VegaInboxLineSchema>;

export interface InboxLineValidation {
  ok: boolean;
  errors: string[];
  value?: VegaInboxLine;
}

/** Validates one inbox line against the contract (schema, key prefix, date, no emoji). */
export function validateInboxLine(raw: unknown): InboxLineValidation {
  const parsed = VegaInboxLineSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: formatZodErrors(parsed.error.issues, VegaInboxLineSchema.shape) };
  }
  const line = parsed.data;
  const errors: string[] = [];
  if (!line.key.startsWith(`${line.producer}:`)) {
    errors.push(`key: must start with "${line.producer}:"`);
  }
  if (Number.isNaN(Date.parse(line.t))) {
    errors.push("t: not a valid date-time");
  }
  const texts: Array<[string, string | undefined]> = [
    ["front", line.front],
    ["back", line.back],
    ["hint", line.hint],
    ["hook", line.hook],
    ["deck", line.deck],
    ["reason", line.reason],
    ...(line.tags ?? []).map((tag, i): [string, string] => [`tags[${i}]`, tag]),
  ];
  for (const [field, value] of texts) {
    if (value && EMOJI.test(value)) errors.push(`${field}: must not contain emoji`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [], value: line };
}

/** Hub root: param `hub`, then env ORION_HUB, then env POLARIS_HUB, then D:/02_Learning_Knowledge. */
export function resolveHub(hubParam?: string, env: NodeJS.ProcessEnv = process.env): string {
  const pick = [hubParam, env.ORION_HUB, env.POLARIS_HUB].find((v) => typeof v === "string" && v.trim().length > 0);
  return resolve((pick ?? DEFAULT_HUB).trim());
}

/** File-name timestamp YYYYMMDDTHHmmss (UTC). */
export function inboxStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
}

function sanitizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = clip(raw.trim(), 40);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

export interface BuildInboxInput {
  labDir: string;
  title: string;
  cards: VegaCardCandidate[];
  sources: ExportCardSource[];
  now?: Date;
}

export interface BuildInboxResult {
  lines: VegaInboxLine[];
  rejected: Array<{ key: string; errors: string[] }>;
  /** Candidates left out because the failing test matched no check declared in lab.json. */
  skipped: Array<{ check: string; reason: string }>;
}

/**
 * Turns exported card candidates into inbox lines:
 * key `orion:<lab folder name>:<check key>`, origin kind `orion-attempt`, path = lab dir, locator = check key.
 * Only checks declared in lab.json become cards (they carry the concept and hints a card is built from); other
 * failing tests, such as an import error on a first attempt, are reported as skipped so they never add review debt.
 * Free-text fields are clipped to the contract limits; the key and origin path are never altered, so a line that
 * exceeds them is rejected instead of being given an unstable key. Lines are validated before they are returned.
 */
export function buildInboxLines(input: BuildInboxInput): BuildInboxResult {
  const now = input.now ?? new Date();
  const labDir = resolve(input.labDir);
  const labName = basename(labDir);
  const lines: VegaInboxLine[] = [];
  const rejected: Array<{ key: string; errors: string[] }> = [];
  const skipped: Array<{ check: string; reason: string }> = [];
  const seen = new Set<string>();

  input.cards.forEach((card, i) => {
    const source = input.sources[i];
    const checkKey = source?.checkKey ?? card.origin.locator?.replace(/^check:\s*/, "") ?? `card-${i + 1}`;
    if (source?.declared === false) {
      skipped.push({ check: checkKey, reason: "không khớp check nào khai báo trong lab.json" });
      return;
    }
    const key = `${INBOX_PRODUCER}:${labName}:${checkKey}`;
    if (seen.has(key)) return; // one card per check: Vega would skip the repeat as a duplicate anyway
    seen.add(key);

    const tags = sanitizeTags(card.tags);
    const raw: Record<string, unknown> = {
      v: VEGA_INBOX_VERSION,
      t: now.toISOString(),
      producer: INBOX_PRODUCER,
      key,
      subject: clip(card.subject?.trim() || input.title, 120),
      ...(card.deck?.trim() ? { deck: clip(card.deck.trim(), 120) } : {}),
      kind: card.kind === "cloze" || card.kind === "reverse" ? card.kind : "basic",
      front: clip(card.front, 600),
      back: clip(card.back, 1200),
      ...(card.hint?.trim() ? { hint: clip(card.hint.trim(), 200) } : {}),
      ...(card.hook?.trim() ? { hook: clip(card.hook.trim(), 200) } : {}),
      origin: {
        kind: "orion-attempt",
        path: toPosix(labDir),
        locator: clip(checkKey, 120),
      },
      ...(tags.length > 0 ? { tags } : {}),
      reason: clip(
        source
          ? `Kiểm tra "${checkKey}" thất bại ${source.failCount} lần trong bài lab "${input.title}"`
          : `Kiểm tra "${checkKey}" thất bại trong bài lab "${input.title}"`,
        200,
      ),
    };

    const verdict = validateInboxLine(raw);
    if (verdict.ok && verdict.value) {
      lines.push(verdict.value);
    } else {
      rejected.push({ key, errors: verdict.errors });
    }
  });

  return { lines, rejected, skipped };
}

/** Writes one new inbox file atomically (`.tmp` then rename). Every line is validated again before writing. */
export async function writeVegaInbox(
  hub: string,
  lines: VegaInboxLine[],
  now: Date = new Date(),
): Promise<{ dir: string; file: string }> {
  if (lines.length === 0) throw new Error("Refusing to write an empty Vega inbox file.");
  lines.forEach((line, i) => {
    const verdict = validateInboxLine(line);
    if (!verdict.ok) {
      throw new Error(`Refusing to write invalid Vega inbox line #${i + 1} (${line.key}): ${verdict.errors.join("; ")}`);
    }
  });

  if (!existsSync(hub) || !statSync(hub).isDirectory()) {
    throw new Error(
      `Hub folder not found: ${hub}. Pass hub, or set ORION_HUB / POLARIS_HUB (default ${DEFAULT_HUB}).`,
    );
  }

  const dir = join(hub, ".vega", "inbox");
  await mkdir(dir, { recursive: true });

  let file = "";
  for (let attempt = 0; attempt < 8 && !file; attempt++) {
    const name = `${INBOX_PRODUCER}-${inboxStamp(now)}-${randomBytes(3).toString("hex")}.jsonl`;
    const candidate = join(dir, name);
    if (!existsSync(candidate) && !existsSync(`${candidate}.tmp`)) file = candidate;
  }
  if (!file) throw new Error("Could not allocate a unique Vega inbox file name.");

  const tmp = `${file}.tmp`;
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  try {
    await writeFile(tmp, body, { encoding: "utf8", flag: "wx" });
    await rename(tmp, file);
  } catch (err) {
    try {
      if (existsSync(tmp)) await unlink(tmp);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
  return { dir, file };
}

/** Vietnamese summary lines for an inbox outcome (shared by the MCP tool and the CLI). */
export function describeInboxOutcome(o: VegaInboxOutcome): string[] {
  const lines: string[] = [];
  if (o.file) {
    lines.push(`Vega inbox: đã ghi ${o.written} thẻ vào ${toPosix(o.file)} (hub: ${toPosix(o.hub)}).`);
    lines.push("Vega sẽ nạp tệp này ở lần vega_sync tiếp theo và bỏ qua thẻ trùng key.");
  } else {
    lines.push(`Vega inbox: không ghi tệp nào${o.note ? ` (${o.note})` : ""}.`);
  }
  if (o.skipped.length > 0) {
    lines.push(
      `Bỏ qua ${o.skipped.length} lỗi không khớp check nào khai báo trong lab.json (lỗi nhập module, quá thời gian, test phụ: chưa có concept hay gợi ý để tạo thẻ): ${o.skipped.map((s) => s.check).join(", ")}.`,
    );
  }
  if (o.rejected.length > 0) {
    lines.push(`Bỏ qua ${o.rejected.length} dòng không hợp lệ so với hợp đồng vega-card-inbox.v1:`);
    for (const r of o.rejected) lines.push(`- ${r.key}: ${r.errors.join("; ")}`);
  }
  return lines;
}
