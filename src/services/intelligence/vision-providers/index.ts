export * from './vision-provider.interface';
export * from './local-cv-provider';
export * from './multimodal-vision-provider';

import { IVisionProvider } from './vision-provider.interface';
import { LocalCvProvider } from './local-cv-provider';
import { MultimodalVisionProvider } from './multimodal-vision-provider';

export function getVisionProvider(): IVisionProvider {
  const multimodal = new MultimodalVisionProvider();
  if (multimodal.isAvailable()) {
    return multimodal;
  }
  return new LocalCvProvider();
}
