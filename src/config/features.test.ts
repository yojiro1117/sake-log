import { describe, expect, it } from 'vitest';
import { FEATURES } from './features';

describe('feature flags', () => {
  it('keeps social processing disabled in the current recording app version', () => {
    expect(FEATURES.socialPosting).toBe(false);
    expect(FEATURES.share).toBe(false);
    expect(FEATURES.postTextGeneration).toBe(false);
    expect(FEATURES.postImageGeneration).toBe(false);
  });
});
