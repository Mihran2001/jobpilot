import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';
import { htmlToPdf, PdfRenderError, runWithTimeout } from '../src/cv/chrome.js';

/** Writes an executable Node script that stands in for Chrome. */
async function fakeProgram(body: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'fake-chrome-'));
  const file = path.join(dir, 'chrome');
  await writeFile(file, `#!${process.execPath}\n${body}\n`);
  await chmod(file, 0o755);
  return file;
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0); // signal 0: "does it exist?"
    return true;
  } catch {
    return false;
  }
};

describe('runWithTimeout', () => {
  it('kills the whole process group on timeout, grandchildren included', async () => {
    // Like Chrome: the program starts a helper process, then hangs.
    const program = await fakeProgram(`
      const { spawn } = require('node:child_process');
      const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      console.error('helper=' + helper.pid);
      setInterval(() => {}, 1000);
    `);
    const result = await runWithTimeout(program, [], 500);
    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe('SIGKILL');

    const helperPid = Number(/helper=(\d+)/.exec(result.stderr)?.[1]);
    await new Promise((r) => setTimeout(r, 100));
    expect(isAlive(helperPid)).toBe(false);
  });

  it('reports the exit code and keeps the tail of stderr', async () => {
    const program = await fakeProgram(
      `console.error('x'.repeat(10000) + 'the real error'); process.exit(3);`,
    );
    const result = await runWithTimeout(program, [], 5_000);
    expect(result.code).toBe(3);
    expect(result.stderr.length).toBe(4_000);
    expect(result.stderr.endsWith('the real error\n')).toBe(true);
  });

  it('rejects when the program does not exist', async () => {
    await expect(runWithTimeout('/no/such/chrome', [], 1_000)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('htmlToPdf', () => {
  it('turns a non-zero exit into a PdfRenderError with stderr', async () => {
    const chromePath = await fakeProgram(`console.error('GPU process crashed'); process.exit(1);`);
    const err = await htmlToPdf('<p>x</p>', {
      chromePath,
      timeoutMs: 5_000,
      noSandbox: false,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfRenderError);
    expect((err as PdfRenderError).message).toBe('Chrome exited with code 1');
    expect((err as PdfRenderError).stderr).toContain('GPU process crashed');
  });

  it('does not trust exit code 0 without a PDF', async () => {
    const chromePath = await fakeProgram(`process.exit(0);`);
    await expect(
      htmlToPdf('<p>x</p>', { chromePath, timeoutMs: 5_000, noSandbox: false }),
    ).rejects.toThrow('Chrome exited cleanly but wrote no PDF');
  });

  it.skipIf(!inject('chromePath'))('renders a real PDF with Chrome', async () => {
    const pdf = await htmlToPdf('<h1>Hello CV</h1>', {
      chromePath: inject('chromePath'),
      timeoutMs: 30_000,
      noSandbox: process.env.CHROME_NO_SANDBOX === 'true', // CI containers
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
