# Performance validation

The 72-image Node-assisted baseline averaged 12,977 ms per image and peaked at 26,393 ms. Node RSS is not used as an iPhone memory claim.

Browser changes reduce retained data and work: preview is emitted before OCR, input is resized to a 1600px bound, a single worker is terminated after use, confident first-pass OCR skips extra variants, and object URLs are revoked. The HEIC dynamic chunk is about 1.35 MB minified; it is loaded only for HEIC/HEIF input.

The production E2E records whether ten real images complete without UI lockup. Browser process memory is runner-specific and must not be presented as physical-device memory.
