import { registerPlugin } from '@capacitor/core';
import type { SakeVisionPlugin } from './visionTypes';

export const nativeVisionAdapter = registerPlugin<SakeVisionPlugin>('SakeVision');
