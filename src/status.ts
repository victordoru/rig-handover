import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/read.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Counts are log lines by status for the night.
export type NightSummary = { night: string; ok: number; retry: number; fail: number };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function summarize(runsDir: string, night: string): NightSummary {
  const rows = readNight(runsDir, night)?.rows ?? [];
  let ok = 0;
  let retry = 0;
  let fail = 0;
  for (const r of rows) {
    retry += r.retries;
    fail += r.fails;
    ok += r.runs - r.retries - r.fails;
  }
  return { night, ok, retry, fail };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarize(config.runsDir, n)),
  };
}
