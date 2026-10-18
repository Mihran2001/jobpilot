# Your tasks

Small things to implement or break yourself, collected stage by stage so you
can do them all at the end. Each one names the files involved. Tick them off
as you go.

Before any of them, in each new terminal:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
```

## Stage 3: pipeline

- [ ] **Make stalled-job recovery faster, and see the cost.** In
      `apps/worker/src/main.ts`, give the fetch-source `Worker` the option
      `lockDuration: 10_000`. Then repeat the kill test: start the worker, start
      a fetch, `kill -9` the worker process mid-fetch, start it again, and time
      how long until the job finishes (it was about 60 s with the 30 s
      default). Then answer: what happens if one job blocks the event loop for
      longer than `lockDuration`? (Hint: the job is considered stalled while it
      is still running, and runs twice.)
- [ ] **Watch a failure in Bull Board.** In `psql`, point the `jobicy` source
      at a path that does not exist:
      `UPDATE sources SET url = 'https://jobicy.com/api/v2/does-not-exist' WHERE name = 'jobicy';`
      Run `pnpm dev:worker` and `pnpm fetch:now jobicy`, then open
      http://127.0.0.1:3002 and find the failed job: 1 attempt, a 404 error,
      no retries (`UnrecoverableError`). Restore the URL afterwards with
      `pnpm db:seed`. This is one Jobicy request, within its hourly limit.
- [ ] **Tune the scoring.** Pick a real listing whose score looks wrong to you
      (`SELECT l.title, s.score FROM listing_scores s JOIN job_listings l ON l.id = s.job_listing_id ORDER BY s.score DESC;`),
      add it as a case in `apps/worker/src/scoring/score.spec.ts` with the
      score you think it deserves, and change `apps/worker/src/scoring/score.ts`
      until it passes without breaking the other cases.

## Stage 4: CV generation and files

- [ ] **Make a NOT NULL column safely.** The `cv_profiles_and_versions`
      migration added `NOT NULL` columns without defaults; Prisma warned that
      this only works on an empty table. Reproduce the failure: generate a CV
      (so `cv_versions` has rows), then add `pageCount Int @map("page_count")`
      to `CvVersion` in `packages/db/prisma/schema.prisma` and run
      `pnpm --filter @jobpilot/db exec prisma migrate dev --name page-count`.
      Read the error. Then do it in three steps: add it as `Int?`, migrate,
      backfill with an `UPDATE` in the migration SQL, then make it required in
      a second migration. Undo afterwards (`prisma migrate reset`, delete the
      migration folders, `git checkout` the schema, `pnpm build`, `pnpm db:seed`).
- [ ] **Watch Chrome get killed.** Start the worker with
      `CV_RENDER_TIMEOUT_MS=1000 pnpm dev:worker` and slow Chrome down: in
      `apps/worker/src/cv/template.ts`, add
      `<script>const end = Date.now() + 5000; while (Date.now() < end) {}</script>`
      at the end of `<body>` (a page that keeps Chrome busy for 5 s). Generate a
      CV (`POST /api/applications/:id/cv`), then check: the version becomes
      `FAILED` with "Chrome did not finish within 1000 ms" after 2 attempts
      (`GET /api/cv-versions/:id`, or Bull Board), and
      `pgrep -fl "jobpilot-cv-"` shows no Chrome left behind. Remove the script.
      (Notice it ran at all: Chrome executes scripts in the page. That is why
      every value in the template is escaped.)
- [ ] **See what streaming saves.** In
      `apps/api/src/modules/exports/exports.repository.ts`, replace the
      cursor with a plain `const { rows } = await client.query(HISTORY_SQL, [userId])`
      and return `Readable.from(rows)` (release the client before returning).
      Run `pnpm --filter @jobpilot/api bench:export-memory` with
      `BENCH_APPLICATIONS=30000` and compare the streamed "peak live" figure
      with the README's. Put the cursor back.

## Stage 5a: web UI

- [ ] **Upload your own CV through the UI.** Run `pnpm dev:api`,
      `pnpm dev:worker` and `pnpm dev:web`, open an application, click "Upload
      my own PDF" and pick any PDF under 5 MB. Then open the browser's DevTools
      Network tab and find the three steps: the Server Action that returns the
      presigned URL, the `PUT` that goes straight to `localhost:9000` (not to
      the web app or the API), and the action that completes it. Try a
      renamed `.txt` file as `x.pdf` and see the "not a PDF" error. (I could
      not click through this one: the in-app browser cannot attach files.)
- [ ] **Watch Cache Components stream.** Run `pnpm --filter @jobpilot/web build`
      and read the route table: which routes are `◐` (Partial Prerender) and
      why are the two route handlers `ƒ`? Then in
      `apps/web/src/app/(app)/listings/loading.tsx`, change the skeleton count,
      throttle the network in DevTools, and watch the shell (header) appear
      before the listings.
- [ ] **Make stale tabs fail loudly.** Open the same application in two
      tabs. In tab A change its status to Applied; in tab B, which still shows
      Saved, change it to Interview. It succeeds: the API reads the current
      status itself, so the history is correct (Applied -> Interview), but the
      person in tab B never learned it had changed. Fix it the way HTTP does
      with `If-Match`: add an optional `expectedStatus` to `changeStatusSchema`
      in `packages/shared/src/applications.ts`, send the status the menu showed
      from `apps/web/src/app/(app)/applications/status-select.tsx` (through
      `changeStatus` in `actions.ts`), and in
      `apps/api/src/modules/applications/applications.repository.ts` return
      `conflict` when it differs from the status read in the transaction. Now
      tab B gets a 409 and its menu snaps back with the message. Add an API test.

## Stage 5b: containers and Kubernetes

Start the cluster first: `pnpm infra:up && pnpm k8s:up`.

- [ ] **See requests drop, then explain why.** Run
      `infra/k8s/rollout-test.sh api`: every request answers 200. Now remove
      the `lifecycle.preStop` block from `infra/k8s/base/api.yaml`, set
      `maxUnavailable: 1` and `maxSurge: 0`, run `pnpm k8s:up`, and run the
      test again (my run lost 3 of 1,646). Explain in two sentences what
      happened to those requests, using the words "endpoints" and "SIGTERM".
      Put the file back (`git checkout infra/k8s/base/api.yaml`, `pnpm k8s:up`).
- [ ] **Get the Prisma CLI out of the API image.** `docker images | grep jobpilot/api`
      shows about 900 MB. Look inside:
      `docker run --rm --entrypoint sh jobpilot/api:<tag> -c 'du -sh /app/node_modules/.pnpm/* | sort -rh | head'`.
      The Prisma CLI, Prisma Studio, TypeScript and React are there, but the API
      only needs `@prisma/client`. The cause: `@prisma/client` has an optional
      peer dependency on `prisma`, `packages/db` has `prisma` as a dev
      dependency, so pnpm resolves the peer and records it as part of
      `@prisma/client`'s identity in `pnpm-lock.yaml` (search for
      `'@prisma/client@7.10.0(prisma@`). `--prod` then installs it anyway.
      Find a fix (ideas: pnpm's `peerDependencyRules`, moving the CLI, or
      `pnpm deploy`), rebuild, and compare sizes. Make sure `pnpm build` and
      the migration Job still work.
- [ ] **Crash the worker mid-CV.** Open an application at http://localhost:8080,
      click "Generate tailored CV", and immediately run
      `kubectl delete pod -n jobpilot -l app=worker --grace-period=0 --force`.
      Watch `kubectl get pods -n jobpilot -w`: the Deployment starts a new pod.
      Does the CV still become READY? How long did it take, and which BullMQ
      setting from stage 3 explains it?
