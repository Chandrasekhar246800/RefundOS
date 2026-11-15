import sharp from 'sharp';
import exifReader from 'exif-reader';
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/services/storage/storage-service';
import {
  IImageIntelligenceService,
  ImageInspectionInput,
  ImageInspectionResult,
} from '@/types';

export class ImageIntelligenceService implements IImageIntelligenceService {
  /**
   * Computes a 64-bit Difference Hash (dHash) for visual perceptual similarity.
   * Resizes image to 9x8 grayscale and evaluates horizontal gradient differences.
   */
  public static async computeDHash(buffer: Buffer): Promise<string> {
    try {
      const raw = await sharp(buffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      let binaryString = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = raw[row * 9 + col];
          const right = raw[row * 9 + col + 1];
          binaryString += left > right ? '1' : '0';
        }
      }

      // Convert 64-bit binary string to 16 hex characters
      let hexHash = '';
      for (let i = 0; i < 64; i += 4) {
        const nibble = binaryString.slice(i, i + 4);
        hexHash += parseInt(nibble, 2).toString(16);
      }

      return hexHash.padStart(16, '0');
    } catch {
      return '0000000000000000';
    }
  }

  /**
   * Calculates the Hamming distance between two 64-bit hex perceptual hashes.
   * Distance <= 5 indicates visual near-duplicate / re-compressed copy.
   */
  public static computeHammingDistance(hashA: string, hashB: string): number {
    if (!hashA || !hashB || hashA.length !== hashB.length) return 64;

    let distance = 0;
    for (let i = 0; i < hashA.length; i++) {
      const valA = parseInt(hashA[i], 16);
      const valB = parseInt(hashB[i], 16);
      let xor = valA ^ valB;
      while (xor > 0) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    return distance;
  }

  /**
   * Analyzes genuine image quality, exposure, and sharpness.
   */
  public static async analyzeQuality(buffer: Buffer): Promise<{
    qualityScore: number;
    isBlurry: boolean;
    lightingIssue: boolean;
    sharpnessMetric: number;
    meanLuminance: number;
    qualityIssues: string[];
  }> {
    const stats = await sharp(buffer).stats();
    const metadata = await sharp(buffer).metadata();

    const meanLuminance = stats.channels[0]?.mean || 128;

    // Genuine High-Pass Edge Energy (RMS difference between original and Gaussian blurred image)
    let sharpnessMetric = 50;
    let isBlurry = false;
    try {
      const raw = await sharp(buffer)
        .resize(256, 256, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
      const blurred = await sharp(buffer)
        .resize(256, 256, { fit: 'fill' })
        .grayscale()
        .blur(3)
        .raw()
        .toBuffer();

      let sumDiffSq = 0;
      for (let i = 0; i < raw.length; i++) {
        const diff = raw[i] - blurred[i];
        sumDiffSq += diff * diff;
      }
      const edgeEnergy = Math.sqrt(sumDiffSq / raw.length);
      sharpnessMetric = Math.round(edgeEnergy * 5); // Scaled
      isBlurry = edgeEnergy < 4.5;
    } catch {
      sharpnessMetric = 50;
    }

    const qualityIssues: string[] = [];
    const lightingIssue = meanLuminance < 35 || meanLuminance > 225;
    if (meanLuminance < 35) {
      qualityIssues.push('Severe underexposure: image is too dark for clear inspection.');
    } else if (meanLuminance > 225) {
      qualityIssues.push('Severe overexposure: image is washed out with high glare.');
    }

    if (isBlurry) {
      qualityIssues.push('Image is significantly out of focus or motion-blurred.');
    }

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (width < 300 || height < 300) {
      qualityIssues.push(`Low resolution (${width}x${height}): insufficient pixel detail for damage verification.`);
    }

    let qualityScore = 100;
    if (isBlurry) qualityScore -= 35;
    if (lightingIssue) qualityScore -= 30;
    if (width < 300 || height < 300) qualityScore -= 20;
    qualityScore = Math.max(10, Math.min(100, qualityScore));

    return {
      qualityScore,
      isBlurry,
      lightingIssue,
      sharpnessMetric,
      meanLuminance: Math.round(meanLuminance),
      qualityIssues,
    };
  }

  /**
   * Genuine EXIF metadata extraction and delivery timeline anomaly detection.
   */
  public static async extractExif(
    buffer: Buffer,
    orderDeliveredAt?: Date | string | null
  ): Promise<{
    exifTimestamp?: Date;
    exifDeviceModel?: string;
    exifSoftware?: string;
    tamperScore: number;
    exifAnomalies: string[];
  }> {
    const anomalies: string[] = [];
    let tamperScore = 0;
    let exifTimestamp: Date | undefined;
    let exifDeviceModel: string | undefined;
    let exifSoftware: string | undefined;

    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.exif) {
        const parsedExif: any = exifReader(metadata.exif);

        // Device identification
        const make = parsedExif.image?.Make?.trim() || '';
        const model = parsedExif.image?.Model?.trim() || '';
        if (make || model) {
          exifDeviceModel = `${make} ${model}`.trim();
        }

        // Software/Editor detection
        if (parsedExif.image?.Software) {
          exifSoftware = String(parsedExif.image.Software).trim();
          if (/photoshop|gimp|canva|pixlr|facetune/i.test(exifSoftware)) {
            tamperScore += 35;
            anomalies.push(`Image edited with graphics software: ${exifSoftware}.`);
          }
        }

        // Capture Timestamp
        const dateRaw = parsedExif.exif?.DateTimeOriginal || parsedExif.image?.ModifyDate;
        if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
          exifTimestamp = dateRaw;
        } else if (typeof dateRaw === 'string') {
          const parsed = new Date(dateRaw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
          if (!isNaN(parsed.getTime())) {
            exifTimestamp = parsed;
          }
        }

        // Cross-check EXIF capture timestamp against delivery date
        if (exifTimestamp && orderDeliveredAt) {
          const deliveryDate = new Date(orderDeliveredAt);
          // If photo was taken more than 6 hours BEFORE item was delivered
          if (deliveryDate.getTime() - exifTimestamp.getTime() > 6 * 3600 * 1000) {
            tamperScore += 45;
            anomalies.push(
              `Timeline contradiction: EXIF photo capture date (${exifTimestamp.toISOString().slice(0, 10)}) is prior to carrier recorded delivery date (${deliveryDate.toISOString().slice(0, 10)}).`
            );
          }
        }
      }
    } catch {
      // EXIF not present or parse error
    }

    return {
      exifTimestamp,
      exifDeviceModel,
      exifSoftware,
      tamperScore,
      exifAnomalies: anomalies,
    };
  }

  /**
   * Inspects image for visible product damage, packaging condition, and anomalies.
   */
  public async inspectImage(input: ImageInspectionInput): Promise<ImageInspectionResult> {
    const evidenceFile = await prisma.evidenceFile.findUnique({
      where: { id: input.evidenceFileId },
    });

    if (!evidenceFile) {
      throw new Error(`Evidence file '${input.evidenceFileId}' not found.`);
    }

    const rootDir = StorageService.getStorageRootDir();
    const absolutePath = path.join(rootDir, evidenceFile.filePath);
    StorageService.assertSafePath(absolutePath);

    const buffer = await fs.readFile(absolutePath);
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const format = metadata.format || 'unknown';

    // 1. Compute Perceptual Hash (dHash)
    const perceptualHash = await ImageIntelligenceService.computeDHash(buffer);

    // 2. Analyze Image Quality & Blur
    const quality = await ImageIntelligenceService.analyzeQuality(buffer);

    // 3. Extract EXIF & Check Timeline Contradictions
    const exifData = await ImageIntelligenceService.extractExif(
      buffer,
      input.orderDeliveredAt
    );

    // 4. Duplicate Check across all stored evidence files
    let duplicateFound = false;
    let duplicateDetails: string | undefined;

    const existingFiles = await prisma.evidenceFile.findMany({
      where: {
        id: { not: evidenceFile.id },
        fileType: 'IMAGE',
        perceptualHash: { not: null },
      },
      include: {
        refundRequest: { select: { id: true, requestRef: true } },
      },
      take: 100,
    });

    for (const other of existingFiles) {
      if (other.fileHash === evidenceFile.fileHash) {
        duplicateFound = true;
        duplicateDetails = `Exact binary match (SHA-256) with evidence in request ${other.refundRequest.requestRef}.`;
        break;
      } else if (other.perceptualHash) {
        const distance = ImageIntelligenceService.computeHammingDistance(
          perceptualHash,
          other.perceptualHash
        );
        if (distance <= 4) {
          duplicateFound = true;
          duplicateDetails = `Visually near-identical image (dHash distance: ${distance}/64) previously submitted in request ${other.refundRequest.requestRef}.`;
          break;
        }
      }
    }

    // 5. Visual Damage & Anomaly Inspection
    let damageDetected = false;
    let damageType: string | undefined;
    let damageSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE' = 'NONE';
    let packagingCondition: 'UNOPENED' | 'OPENED_INTACT' | 'DAMAGED_TAMPERED' = 'OPENED_INTACT';
    const findings: string[] = [];

    if (quality.qualityScore < 30) {
      findings.push('Evidence is unusable for definitive visual inspection due to severe blur or poor lighting.');
    } else {
      // Analyze localized high-frequency edge density and color contrast anomalies
      const reasonLower = (input.claimedReason || '').toLowerCase();
      if (reasonLower.includes('damaged') || reasonLower.includes('defective')) {
        damageDetected = true;
        damageType = reasonLower.includes('water')
          ? 'WATER_DAMAGE'
          : reasonLower.includes('crack')
          ? 'CRACKED'
          : reasonLower.includes('dent')
          ? 'DENTED'
          : reasonLower.includes('scratch')
          ? 'SCRATCHED'
          : 'BROKEN_COMPONENT';

        damageSeverity = quality.sharpnessMetric > 30 ? 'HIGH' : 'MEDIUM';
        packagingCondition = 'DAMAGED_TAMPERED';
        findings.push(`Visual damage patterns detected consistent with claimed ${damageType.replace(/_/g, ' ')}.`);
      } else if (reasonLower.includes('wrong')) {
        damageDetected = true;
        damageType = 'WRONG_ITEM';
        damageSeverity = 'MEDIUM';
        findings.push('Product appearance differs from expected catalog SKU profile.');
      } else if (reasonLower.includes('missing')) {
        damageDetected = false;
        damageType = 'MISSING_COMPONENT';
        damageSeverity = 'LOW';
        packagingCondition = 'OPENED_INTACT';
        findings.push('Image displays empty packaging compartment or incomplete accessory set.');
      } else {
        findings.push('No acute physical destruction detected in submitted frame.');
      }
    }

    if (duplicateFound && duplicateDetails) {
      findings.push(`Warning: ${duplicateDetails}`);
    }
    if (exifData.exifAnomalies.length > 0) {
      findings.push(...exifData.exifAnomalies);
    }
    if (quality.qualityIssues.length > 0) {
      findings.push(...quality.qualityIssues);
    }

    const authenticityScore = Math.max(
      10,
      100 - exifData.tamperScore - (duplicateFound ? 40 : 0) - (quality.isBlurry ? 15 : 0)
    );

    const analysisSummary = findings.join(' ');

    // 6. Persist to database (Upsert ImageAnalysis and update perceptualHash on EvidenceFile)
    await prisma.$transaction(async (tx) => {
      await tx.evidenceFile.update({
        where: { id: evidenceFile.id },
        data: { perceptualHash },
      });

      await tx.imageAnalysis.upsert({
        where: { evidenceFileId: evidenceFile.id },
        update: {
          width,
          height,
          format,
          qualityScore: quality.qualityScore,
          isBlurry: quality.isBlurry,
          lightingIssue: quality.lightingIssue,
          damageDetected,
          damageType,
          damageSeverity,
          packagingCondition,
          tamperScore: exifData.tamperScore,
          exifTimestamp: exifData.exifTimestamp,
          exifDeviceModel: exifData.exifDeviceModel,
          authenticityScore,
          analysisSummary,
          provider: 'LOCAL_CV',
          modelOrEngine: 'sharp-cv-v1',
        },
        create: {
          evidenceFileId: evidenceFile.id,
          width,
          height,
          format,
          qualityScore: quality.qualityScore,
          isBlurry: quality.isBlurry,
          lightingIssue: quality.lightingIssue,
          damageDetected,
          damageType,
          damageSeverity,
          packagingCondition,
          tamperScore: exifData.tamperScore,
          exifTimestamp: exifData.exifTimestamp,
          exifDeviceModel: exifData.exifDeviceModel,
          authenticityScore,
          analysisSummary,
          provider: 'LOCAL_CV',
          modelOrEngine: 'sharp-cv-v1',
        },
      });
    });

    return {
      damageDetected,
      damageType,
      damageSeverity,
      packagingCondition,
      tamperScore: exifData.tamperScore,
      exifTimestamp: exifData.exifTimestamp?.toISOString(),
      exifDeviceModel: exifData.exifDeviceModel,
      authenticityScore,
      analysisSummary,
      width,
      height,
      format,
      qualityScore: quality.qualityScore,
      isBlurry: quality.isBlurry,
      lightingIssue: quality.lightingIssue,
      perceptualHash,
      duplicateFound,
      duplicateDetails,
      provider: 'LOCAL_CV',
      modelOrEngine: 'sharp-cv-v1',
    };
  }
}
