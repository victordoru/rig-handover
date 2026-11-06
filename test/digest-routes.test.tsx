import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NORMAL = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(dir, `${NORMAL}.jsonl`),
    [
      line({ at: '2026-01-01T02:00:00+01:00', job: 'backup', status: 'ok', owner: 'ana' }),
      line({ at: '2026-01-01T02:05:00+01:00', job: 'sync-zeta', status: 'retry', owner: 'bo' }),
      line({ at: '2026-01-01T02:06:00+01:00', job: 'sync-zeta', status: 'retry', owner: 'bo' }),
      line({ at: '2026-01-01T02:07:00+01:00', job: 'sync-zeta', status: 'retry', owner: 'bo' }),
      line({ at: '2026-01-01T03:00:00+01:00', job: 'cleanup', status: 'fail', owner: 'cy', error: 'disk full' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    [
      line({ at: '2026-01-03T02:00:00+01:00', job: 'backup', status: 'ok', owner: 'ana' }),
      '{"at":"2026-01-03T02:10:00+01:00","job":"trunc',
      line({ at: '2026-01-03T02:20:00+01:00', job: 'report', status: 'ok', owner: 'bo' }),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Body = { night: string; rows: { job: string }[]; badLines: number };
const json = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Body };
};

describe('digest page', () => {
  it('200 on a normal night and shows the jobs', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['backup', 'sync-zeta', 'cleanup']) expect(html).toContain(job);
    expect(html).toContain('disk full');
  });

  it('404 for a night with no file', async () => {
    expect((await app.request(`/digest/${MISSING}`)).status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad-line night still renders the valid rows', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup');
    expect(html).toContain('report');
    expect(html).toContain('1 line could not be read');
  });
});

describe('digest json', () => {
  it('200 on a normal night with the rows', async () => {
    const { res, body } = await json(NORMAL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(['backup', 'cleanup', 'sync-zeta']);
    expect(body.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    const { res } = await json(MISSING);
    expect(res.status).toBe(404);
  });

  it('empty night has no rows and no bad lines', async () => {
    const { res, body } = await json(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('bad-line night is 200 with badLines 1', async () => {
    const { res, body } = await json(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup', 'report']);
  });
});

describe('page and json agree', () => {
  it('list the same jobs in the same order', async () => {
    const { body } = await json(NORMAL);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const inPage = [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(inPage).toEqual(body.rows.map((r) => r.job));
  });
});
