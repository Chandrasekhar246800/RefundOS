export type DamageClassification =
  | 'CRACKED'
  | 'SCRATCHED'
  | 'DENTED'
  | 'BROKEN_COMPONENT'
  | 'WATER_DAMAGE'
  | 'PACKAGING_DAMAGE'
  | 'MISSING_COMPONENTS'
  | 'NONE'
  | 'UNSUPPORTED_WITHOUT_VISION_MODEL';

export interface SemanticVisionResult {
  isSemanticVision: boolean;
  damageDetected: boolean | null;
  damageType: DamageClassification;
  damageSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  packagingCondition: 'UNOPENED' | 'OPENED_INTACT' | 'DAMAGED_TAMPERED';
  visualConfidence: number | null;
  findings: string[];
  analysisSummary: string;
  provider: string;
  modelOrEngine: string;
}

export interface IVisionProvider {
  readonly name: string;
  isAvailable(): boolean;
  analyzeImage(
    imageBuffer: Buffer,
    mimeType: string,
    claimedContext?: string
  ): Promise<SemanticVisionResult>;
}
