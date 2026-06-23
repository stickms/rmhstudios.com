# Senior-SWE LLM Review Gate for a Specific Author

## Goal

When GitHub user `arexwu` opens a pull request, run an LLM "senior software
engineer" review of the diff and block merge until that review passes. PRs from
any other author are unaffected.

## Mechanism

A single workflow, `.github/workflows/senior-review.yml`, with one job named
`senior-swe-review`. The job name is the status-check context that branch
protection marks as required.

### Trigger

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
```

Runs on every PR so the required check always reports a result. The review work
only executes for `arexwu`; for everyone else the job passes immediately.

### Job steps

1. **Author gate.** A first step exports whether
   `github.event.pull_request.user.login == 'arexwu'`. Subsequent review steps
   are guarded on that condition. If the author is not arexwu, the job ends
   green with no review.
2. **Checkout** with `fetch-depth: 0`.
3. **Compute diff:** `git diff origin/$BASE...HEAD > pr.diff` where `$BASE` is
   the PR base ref.
4. **Review** with `anthropics/claude-code-action@v1`, authenticated by the
   `ANTHROPIC_API_KEY` repo secret. The prompt frames Claude as a senior SWE
   reviewing `pr.diff` for correctness, simplicity, duplication/reuse, naming,
   dead code, tests, and repo conventions. Claude posts the review as a PR
   comment and writes a verdict file whose last line is `PASS` or `FAIL`.
5. **Gate.** A final step reads the verdict file and `exit 1` on `FAIL`,
   turning the check red and blocking merge.

### Model

`claude-opus-4-8` (strongest available) for review quality.

## Merge blocking

The workflow alone cannot make a check "required" — that is branch protection.
After the workflow is on `main`, mark the `senior-swe-review` context required:

```bash
gh api -X PUT repos/stickms/rmhstudios.com/branches/main/protection/required_status_checks \
  -f strict=false -f 'contexts[]=senior-swe-review'
```

(Needs admin on the repo. The context must have run at least once for GitHub to
recognize it.)

## Constraints / notes

- Requires an `ANTHROPIC_API_KEY` repo secret.
- arexwu must push branches within the repo; fork PRs do not receive secrets,
  so the review step would be skipped for forks.
- Gating target branch: `main`.
