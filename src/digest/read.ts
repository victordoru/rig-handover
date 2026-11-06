// Reads runs/<night>.jsonl into one row per job (plan.md § 1).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isStatus = (v: unknown): v is RunStatus =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

// Parse one line at the edge. Returns null for anything that isn't a valid run line.
export const parseLine = (line: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isStatus(o.status)) return null;
  const owner = o.owner === undefined ? null : o.owner;
  if (owner !== null && typeof owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const run: RunLine = { at: o.at, job: o.job, status: o.status, owner };
  if (typeof o.error === 'string') run.error = o.error;
  return run;
};

const readFileOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const run = parseLine(raw);
    if (run === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        fails: run.status === 'fail' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs++;
    if (run.status === 'retry') row.retries++;
    if (run.status === 'fail') row.fails++;
    row.owner = run.owner;
    row.lastStatus = run.status;
    row.lastError = run.error ?? null;
    row.lastAt = run.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
