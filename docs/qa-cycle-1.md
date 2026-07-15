# QA cycle 1

- Scope: save flow, photo retry, draft persistence, OCR learning, backup, logs.
- Expected: no stale form data, no duplicate save, successful photos survive retry, complete ZIP restore.
- Reproduced: retry replaced prior successes; completion buttons did not navigate; draft timestamps reset; backup omitted image and draft blobs.
- Cause: result arrays were replaced, navigation state was absent, and export covered only JSON tables.
- Changes: keyed queue merge, saveOperationId, revision-aware drafts, explicit navigation callbacks, transactional ZIP backup.
- Verification: unit tests cover eight-success/two-failure retry, idempotent save, learning idempotency, image/draft restore.
- Result: 30 unit tests passed after the first fixes. Initial lint found five backup errors; all were corrected.

