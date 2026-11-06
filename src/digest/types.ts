// Types for the night's run log digest (plan.md § 1). Types only: the reader lives elsewhere.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl.
export type RunLine = {
  at: string; // ISO time, offset kept as written in the log
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number;
  retries: number;
  fails: number; // count of `fail` lines
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string; // ISO with the original offset, never converted to UTC
  lastAt: string; // ISO with the original offset, never converted to UTC
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[];
  badLines: number; // lines that didn't parse: counted, never thrown
};

// readNight(runsDir, night) reads runsDir/<night>.jsonl.
// Rows are sorted by job. Returns null when the file for that night does not exist.
export type ReadNight = (runsDir: string, night: string) => Night | null;
