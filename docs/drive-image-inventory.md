# Drive Image Inventory

- Source folder: `1d3XLdTF1Z52n1tHumGqeJEY68gAy6ESr`
- Scanned: 2026-07-15
- Direct image files: 151
- Unique SHA-256 images: 150
- Exact duplicates: 1
- HEIC/HEIF: 131
- JPEG: 20
- Download success: 151 / 151

The public folder HTML returned only the latest 50 items, so the inventory merged the public listing, connector listing, and previously recorded Drive IDs, then deduplicated by Drive file ID. Duplicate file names are stored temporarily as `driveFileId__fileName`; results are keyed by Drive ID.

Images were downloaded only to a Git-ignored temporary directory. The repository stores metadata, hashes, EXIF, OCR output, timings, warnings, and errors, never the image bodies or contact sheets.
