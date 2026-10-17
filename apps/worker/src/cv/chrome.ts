import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ChromeOptions {
  chromePath: string;
  timeoutMs: number;
  /** Needed in many containers, where Chrome's sandbox cannot set up namespaces. */
  noSandbox: boolean;
}

export class PdfRenderError extends Error {
  constructor(
    message: string,
    /** The last few KB Chrome wrote to stderr, for the logs. */
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'PdfRenderError';
  }
}

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
}

const STDERR_LIMIT = 4_000;

/**
 * Runs a program and waits for it, with a hard timeout.
 *
 * `detached: true` puts the program in its own process group. Chrome starts
 * helper processes (renderer, GPU, ...); on timeout the whole group is killed
 * with `process.kill(-pid)`, not just the parent, so nothing is left behind.
 */
export function runWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_LIMIT); // keep only the tail
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL'); // the whole group
      } catch {
        child.kill('SIGKILL'); // group already gone; make sure the parent is
      }
    }, timeoutMs);

    // 'error' = the program could not be started at all (e.g. wrong path).
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stderr, timedOut });
    });
  });
}

/**
 * HTML in, PDF bytes out, by running headless Chrome as a separate program:
 *   chrome --headless --print-to-pdf=out.pdf file:///.../cv.html
 * Works in a fresh temporary directory that is always removed afterwards.
 */
export async function htmlToPdf(html: string, options: ChromeOptions): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'jobpilot-cv-'));
  try {
    const htmlPath = path.join(dir, 'cv.html');
    const pdfPath = path.join(dir, 'cv.pdf');
    await writeFile(htmlPath, html, 'utf8');

    const args = [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      // A throwaway profile, so parallel jobs never share Chrome state.
      `--user-data-dir=${path.join(dir, 'profile')}`,
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      ...(options.noSandbox ? ['--no-sandbox'] : []),
      pathToFileURL(htmlPath).href,
    ];

    const result = await runWithTimeout(options.chromePath, args, options.timeoutMs);
    if (result.timedOut) {
      throw new PdfRenderError(
        `Chrome did not finish within ${options.timeoutMs} ms`,
        result.stderr,
      );
    }
    if (result.code !== 0) {
      const how = result.signal
        ? `was killed by ${result.signal}`
        : `exited with code ${result.code}`;
      throw new PdfRenderError(`Chrome ${how}`, result.stderr);
    }

    // Exit code 0 is not proof: check that a real PDF was written.
    const pdf = await readFile(pdfPath).catch(() => null);
    if (!pdf || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new PdfRenderError('Chrome exited cleanly but wrote no PDF', result.stderr);
    }
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
