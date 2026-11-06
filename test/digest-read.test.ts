import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts runs and retries, last status from the latest line', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
    });
  });

  it('keeps the last error and counts fails', () => {
    expect(row('notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      fails: 1,
    });
  });

  it('keeps a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps the offset as written', () => {
    const r = row('fixtures/refresh');
    expect(r?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(r?.firstAt.endsWith('+01:00')).toBe(true);
    expect(r?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '1999-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('ignores blank lines and counts wrong shapes as bad', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+02:00","job":"a","status":"ok"}',
      '',
      '   ',
      '{"at":"2026-01-02T02:00:00+02:00","job":"a","status":"maybe","owner":null}',
      '[1,2]',
      'null',
    ];
    writeFileSync(join(dir, '2026-01-02.jsonl'), lines.join('\n') + '\n');
    const n = readNight(dir, '2026-01-02');
    expect(n?.badLines).toBe(3);
    expect(n?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        fails: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-02T01:00:00+02:00',
        lastAt: '2026-01-02T01:00:00+02:00',
      },
    ]);
  });
});
