import {
  IVisionProvider,
  SemanticVisionResult,
  DamageClassification,
} from './vision-provider.interface';

/**
 * Multimodal Vision Model Provider.
 * Integrates external multimodal vision endpoints (OpenAI GPT-4o-mini / Vision, Google Gemini,
 * or compatible multimodal LLM APIs) to perform genuine zero-shot semantic product damage inspection.
 */
export class MultimodalVisionProvider implements IVisionProvider {
  public readonly name = 'MULTIMODAL_VISION';
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor() {
    this.apiKey =
      process.env.VISION_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      '';
    this.endpoint =
      process.env.VISION_API_ENDPOINT ||
      'https://api.openai.com/v1/chat/completions';
    this.model = process.env.VISION_MODEL || 'gpt-4o-mini';
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async analyzeImage(
    imageBuffer: Buffer,
    mimeType: string,
    claimedContext?: string
  ): Promise<SemanticVisionResult> {
    if (!this.isAvailable()) {
      throw new Error(
        'Multimodal Vision Provider is not available: VISION_API_KEY is not configured.'
      );
    }

    const base64Data = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const systemPrompt = `You are an expert forensic product inspection and damage classification AI for e-commerce refund claims.
Analyze the provided product image and determine if genuine product damage exists.

Categorize visual damage strictly into one of these specific types:
- CRACKED: Structural fractures, shattered screens, split plastic/glass
- SCRATCHED: Deep surface abrasions, scraped coating
- DENTED: Metallic or rigid casing indentations, crushed corners
- BROKEN_COMPONENT: Snapped hinges, detached connectors, sheared switches
- WATER_DAMAGE: Corrosion, water stains, liquid infiltration, fogged lens
- PACKAGING_DAMAGE: Crushed delivery box, torn seals, compromised tape
- MISSING_COMPONENTS: Empty accessory compartments, incomplete set
- NONE: No visual defects observed

Respond ONLY with a valid JSON object matching this schema:
{
  "damageDetected": boolean,
  "damageType": "CRACKED" | "SCRATCHED" | "DENTED" | "BROKEN_COMPONENT" | "WATER_DAMAGE" | "PACKAGING_DAMAGE" | "MISSING_COMPONENTS" | "NONE",
  "damageSeverity": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "SEVERE",
  "packagingCondition": "UNOPENED" | "OPENED_INTACT" | "DAMAGED_TAMPERED",
  "visualConfidence": number (between 0.0 and 1.0),
  "findings": string[] (list of 2-4 specific observed visual features),
  "analysisSummary": string (concise 1-2 sentence visual description)
}`;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Claimed customer context: "${claimedContext || 'Product damage inspection'}". Please analyze the image.`,
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl, detail: 'low' },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision API error: HTTP ${response.status} ${response.statusText}`);
      }

      const resJson = await response.json();
      const content = resJson.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);

      return {
        isSemanticVision: true,
        damageDetected: Boolean(parsed.damageDetected),
        damageType: (parsed.damageType as DamageClassification) || 'NONE',
        damageSeverity: parsed.damageSeverity || 'NONE',
        packagingCondition: parsed.packagingCondition || 'OPENED_INTACT',
        visualConfidence: Number(parsed.visualConfidence || 0.8),
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        analysisSummary: parsed.analysisSummary || 'Semantic visual inspection completed.',
        provider: 'MULTIMODAL_VISION',
        modelOrEngine: this.model,
      };
    } catch (err: any) {
      console.warn('Vision Model execution failed, falling back:', err.message);
      return {
        isSemanticVision: false,
        damageDetected: null,
        damageType: 'UNSUPPORTED_WITHOUT_VISION_MODEL',
        damageSeverity: 'NONE',
        packagingCondition: 'OPENED_INTACT',
        visualConfidence: null,
        findings: [`Vision Model call failed: ${err.message}`],
        analysisSummary:
          'Vision Model call failed. Semantic damage classification could not be verified.',
        provider: 'MULTIMODAL_VISION (ERROR)',
        modelOrEngine: this.model,
      };
    }
  }
}
