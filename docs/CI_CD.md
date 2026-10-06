# LoveTravel CI/CD operating model

## Scope boundaries

Every change belongs to exactly one primary verification scope:

- **Code / contracts** → `ci.yml`
- **Booking UI** → `booking-ui-browser.yml`
- **AI browser journey** → `client-ai-browser-e2e.yml`
- **Production deployment** → `deploy-production.yml`
- **Read-only production acceptance** → `post-deploy-smoke.yml`
- **Release orchestration** → `release-production.yml`
- **Real Bókun mutation** → `lovetravel-live-bokun-gate.yml`

A failure outside the current task scope is recorded as a separate issue. It must not automatically expand the current task.

## Rules

1. Work in a feature branch. Do not use `main` to debug tests.
2. Pull requests run only the fast code/build CI.
3. Production deployment never deploys the separate VIIVERSION integration repository.
4. Browser acceptance never creates a real booking.
5. Real Bókun booking is manual-only and requires explicit confirmation in the workflow input.
6. CI and browser verification use concurrency cancellation so stale runs cannot pile up.
7. Production deployment is serialized and is never cancelled mid-deploy.
8. No marker-file or comment-only commits are used to trigger workflows.
9. No workflow dispatches and polls another workflow through the GitHub REST API; reusable workflows use `workflow_call`.
10. A UI task stops when its acceptance criteria are verified. Adjacent defects are handled separately.

## Standard flows

### Feature / bug fix

```
feature branch
  -> pull request
  -> LoveTravel CI
  -> merge
```

### Production release

```
Release LoveTravel production (manual)
  -> Deploy LoveTravel production
  -> LoveTravel post-deploy smoke
  -> optional read-only booking UI browser smoke
```

### AI acceptance

Run `LoveTravel client AI browser E2E` manually when AI behavior changes.

### Real Bókun verification

Run `LoveTravel live Bókun release gate` manually only when a real provider mutation is explicitly required.
The workflow is guarded by `confirm_real_booking=true`.
