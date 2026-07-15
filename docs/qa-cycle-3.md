# QA cycle 3

- Scope: production-browser validation and deployment gating.
- Change: GitHub Actions now tests the built `dist` before deploy in WebKit and Chromium. Twenty real Drive images are downloaded to runner temp and passed through the application file input in two ten-image batches.
- Assertions: first preview appears before queue completion, ten previews remain, OCR confidence is shown, and candidates are not auto-confirmed.
- Additional coverage: 375, 390 and 430 pixel projects, offline PWA shell, 100 tab transitions, build hash, and serious/critical axe checks.
- Release rule: deploy depends on both build and production-preview QA. A public smoke test runs only after deployment.
- Raw images are neither committed nor uploaded as workflow artifacts.

