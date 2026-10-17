'use client';

import type { CvVersionResponse } from '@jobpilot/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { buttonClass, ErrorText, formatDate } from '@/components/ui';
import { completeCvUpload, generateCv, startCvUpload } from '../actions';

const MAX_BYTES = 5 * 1024 * 1024;

export function CvPanel({
  applicationId,
  versions,
}: {
  applicationId: string;
  versions: CvVersionResponse[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // While the worker is still making a PDF, refresh the server-rendered list
  // every 2 s. router.refresh() re-runs the Server Components; no client fetching.
  const pending = versions.some((v) => v.status === 'PENDING');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), 2_000);
    return () => clearInterval(timer);
  }, [pending, router]);

  function generate() {
    setError(undefined);
    startTransition(async () => {
      const result = await generateCv(applicationId);
      if (result.error) setError(result.error);
    });
  }

  function upload(file: File) {
    setError(undefined);
    if (file.type !== 'application/pdf') return setError('Choose a PDF file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 5 MB.');

    startTransition(async () => {
      const started = await startCvUpload({
        applicationId,
        fileName: file.name,
        sizeBytes: file.size,
      });
      if ('error' in started) return setError(started.error);
      // The file goes from the browser straight to storage; the API never sees the bytes.
      const put = await fetch(started.upload.url, {
        method: 'PUT',
        headers: { 'content-type': started.upload.headers['content-type'] ?? 'application/pdf' },
        body: file,
      });
      if (!put.ok) return setError(`Upload failed (${put.status}).`);
      const done = await completeCvUpload(started.cvVersion.id, applicationId);
      if (done.error) setError(done.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={generate} disabled={busy} className={buttonClass()}>
          Generate tailored CV
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={buttonClass('secondary')}
        >
          Upload my own PDF
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
      </div>
      <ErrorText>{error}</ErrorText>

      {versions.length === 0 ? (
        <p className="text-sm text-slate-500">No CVs for this application yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate">{v.fileName}</p>
                <p className="text-xs text-slate-500">
                  {v.source === 'GENERATED' ? 'Generated' : 'Uploaded'} · {formatDate(v.createdAt)}
                  {v.sizeBytes !== null && ` · ${Math.round(v.sizeBytes / 1024)} KB`}
                </p>
                {v.status === 'FAILED' && <p className="text-xs text-red-700">{v.error}</p>}
              </div>
              {v.status === 'READY' ? (
                // A Route Handler that redirects to a short-lived storage URL.
                <a href={`/cv-versions/${v.id}/download`} className={buttonClass('secondary')}>
                  Download
                </a>
              ) : v.status === 'PENDING' ? (
                <span className="text-xs text-slate-500">Working…</span>
              ) : (
                <span className="text-xs text-red-700">Failed</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
