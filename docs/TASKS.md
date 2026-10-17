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
