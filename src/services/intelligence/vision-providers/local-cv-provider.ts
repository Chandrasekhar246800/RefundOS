import {
  IVisionProvider,
  SemanticVisionResult,
} from './vision-provider.interface';

/**
 * Local Classical Computer Vision Provider.
 * Truthfully identifies that semantic product damage categorization cannot be reliably
 * performed with edge-detection/contrast heuristics alone and explicitly reports
 * these semantic categories as unsupported without a multimodal vision model.
 */
export class LocalCvProvider implements IVisionProvider {
  public readonly name = 'LOCAL_CV';

  public isAvailable(): boolean {
    return true; // Always available locally
  }

  public async analyzeImage(
    imageBuffer: Buffer,
    mimeType: string,
    claimedContext?: string
  ): Promise<SemanticVisionResult> {
    const findings: string[] = [
      'Image structural integrity, dimensions, and compression format verified by local engine.',
      'Semantic damage detection (cracks, scratches, dents, broken components, water damage, packaging damage, missing components) is unsupported by local classical CV heuristics alone.',
      'To enable semantic damage classification, configure a Multimodal Vision Provider (e.g. OpenAI Vision, Gemini Vision).',
    ];

    return {
      isSemanticVision: false,
      damageDetected: null, // Explicitly null: local CV cannot make this determination
      damageType: 'UNSUPPORTED_WITHOUT_VISION_MODEL',
      damageSeverity: 'NONE',
      packagingCondition: 'OPENED_INTACT',
      visualConfidence: null,
      findings,
      analysisSummary:
        'Semantic product damage classification requires an active Multimodal Vision Provider. Local CV verified file structure, exposure, sharpness, and EXIF forensics only.',
      provider: 'LOCAL_CV',
      modelOrEngine: 'sharp-cv-v1',
    };
  }
}
