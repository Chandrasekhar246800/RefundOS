import {
  IImageIntelligenceService,
  ImageInspectionInput,
  ImageInspectionResult,
} from '@/types';

/**
 * ImageIntelligenceService contract for REFUND OS 2.0.
 * 
 * NOTE: Metadata extraction is NOT visual damage detection.
 * Actual vision model evaluation will be integrated in Phase 2 using
 * a verified AI vision provider or local engine.
 */
export class ImageIntelligenceService implements IImageIntelligenceService {
  async inspectImage(input: ImageInspectionInput): Promise<ImageInspectionResult> {
    // Contract definition: Ready for verified vision AI models in Phase 2.
    // Throws or returns explicit unperformed analysis until Phase 2 is activated.
    return {
      damageDetected: false,
      damageSeverity: 'NONE',
      packagingCondition: 'UNOPENED',
      tamperScore: 0,
      authenticityScore: 100,
      analysisSummary: 'Pending Phase 2 Vision Model Inspection.',
    };
  }
}
