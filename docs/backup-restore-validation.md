# Backup and restore validation

Backup format v2 is a ZIP containing logs, image metadata and blobs, draft metadata and blobs, price candidates, settings, templates, OCR/classification learning, external sources, diagnostics, diagnosis results and backup status. SHA-256 checksums are validated before writing.

Restore supports merge and replace. Replace is preceded by a safety export in the UI. All writes run in one Dexie transaction. Tests cover image/draft round-trip, auxiliary tables, replace semantics, and rejection of a modified checksummed payload.

