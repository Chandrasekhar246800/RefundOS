import { prisma } from '@/lib/prisma';
import {
  IFraudDetectionEngine,
  FraudEvaluationResult,
} from '@/types';
import { CustomerRiskService } from './customer-risk-service';
import { ImageIntelligenceService } from './image-intelligence';

export class FraudDetectionEngine implements IFraudDetectionEngine {
  private customerRiskService: CustomerRiskService;

  constructor() {
    this.customerRiskService = new CustomerRiskService();
  }

  /**
   * Performs an explainable multi-dimensional fraud and anomaly evaluation for a refund request.
   */
  public async evaluateFraudRisk(refundRequestId: string): Promise<FraudEvaluationResult> {
    const request = await prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            customer: true,
            product: true,
          },
        },
        customer: true,
        product: {
          include: {
            refundRequests: true,
            orders: true,
          },
        },
        evidenceFiles: {
          include: {
            imageAnalysis: true,
            documentAnalysis: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error(`Refund request '${refundRequestId}' not found.`);
    }

    const detectedPatterns: string[] = [];
    const anomalyDetails: Record<string, any> = {};
    const contributingEvidence: string[] = [];
    const missingInformation: string[] = [];
    let scoreAccumulator = 0;

    // =========================================================================
    // 1. Customer Historical Signals (Module 1 Hand-off)
    // =========================================================================
    const customerRisk = await this.customerRiskService.evaluateCustomerRisk(
      request.customerId
    );

    // Baseline contribution from customer history (weighted at 30%)
    const customerContribution = Math.round(customerRisk.compositeRiskScore * 0.3);
    scoreAccumulator += customerContribution;
    anomalyDetails.customerRiskProfile = {
      score: customerRisk.compositeRiskScore,
      tier: customerRisk.riskTier,
      contribution: customerContribution,
      activeSignals: customerRisk.contributingSignals.map((s) => s.rule),
    };

    if (customerRisk.riskTier === 'HIGH' || customerRisk.riskTier === 'CRITICAL') {
      detectedPatterns.push('ELEVATED_CUSTOMER_HISTORICAL_RISK');
    }

    // =========================================================================
    // 2. Dimension A: Refund Behaviour Anomalies
    // =========================================================================
    // A1: Multiple refund requests against the same order
    const otherClaimsOnOrder = await prisma.refundRequest.count({
      where: {
        orderId: request.orderId,
        id: { not: request.id },
      },
    });

    if (otherClaimsOnOrder > 0) {
      scoreAccumulator += 25;
      detectedPatterns.push('REPEATED_CLAIM_ON_ORDER');
      anomalyDetails.repeatedOrderClaims = {
        otherClaimCount: otherClaimsOnOrder,
        orderRef: request.order.orderRef,
      };
    }

    // A2: Excessive requested amount exceeding billed purchase
    if (request.requestedAmount > request.order.amount) {
      scoreAccumulator += 20;
      detectedPatterns.push('REFUND_AMOUNT_EXCEEDS_ORDER');
      anomalyDetails.amountInflation = {
        requestedAmountCents: request.requestedAmount,
        orderBilledCents: request.order.amount,
      };
    }

    // A3: High velocity claims within 7 days
    if (customerRisk.claimsLast7Days >= 2) {
      detectedPatterns.push('HIGH_VELOCITY_7_DAYS');
      anomalyDetails.velocity7Days = customerRisk.claimsLast7Days;
    }

    // =========================================================================
    // 3. Dimension B: Evidence & Multimodal Forensics
    // =========================================================================
    const files = request.evidenceFiles;
    let hasDuplicateEvidence = false;
    let hasDocumentContradiction = false;
    let hasTimelineContradiction = false;

    if (files.length === 0) {
      // Check if claim reason requires visual or documentary proof
      if (
        request.reason === 'DAMAGED_ITEM' ||
        request.reason === 'DEFECTIVE' ||
        request.reason === 'WRONG_ITEM'
      ) {
        missingInformation.push('MISSING_PRODUCT_IMAGE_EVIDENCE');
        scoreAccumulator += 15;
        detectedPatterns.push('MISSING_REQUIRED_EVIDENCE');
        anomalyDetails.evidenceCompliance =
          'Claim states product damage or defect but no photographic proof was submitted.';
      }
    } else {
      for (const file of files) {
        // B1: Exact binary duplicate check (SHA-256) across other refund requests
        const exactMatch = await prisma.evidenceFile.findFirst({
          where: {
            id: { not: file.id },
            refundRequestId: { not: request.id },
            fileHash: file.fileHash,
          },
          include: {
            refundRequest: { select: { id: true, requestRef: true } },
          },
        });

        if (exactMatch) {
          hasDuplicateEvidence = true;
          scoreAccumulator += 30;
          detectedPatterns.push('DUPLICATE_FILE_HASH_CROSS_CLAIM');
          contributingEvidence.push(file.id);
          anomalyDetails.duplicateHash = {
            fileId: file.id,
            conflictingRequestRef: exactMatch.refundRequest.requestRef,
            sha256: file.fileHash,
          };
        }

        // B2: Perceptual near-duplicate check (dHash) on images
        if (file.perceptualHash) {
          const otherImages = await prisma.evidenceFile.findMany({
            where: {
              id: { not: file.id },
              refundRequestId: { not: request.id },
              fileType: 'IMAGE',
              perceptualHash: { not: null },
            },
            select: { id: true, perceptualHash: true, refundRequest: { select: { requestRef: true } } },
          });

          for (const other of otherImages) {
            if (other.perceptualHash) {
              const distance = ImageIntelligenceService.computeHammingDistance(
                file.perceptualHash,
                other.perceptualHash
              );
              if (distance <= 4) {
                hasDuplicateEvidence = true;
                scoreAccumulator += 25;
                detectedPatterns.push('PERCEPTUAL_NEAR_DUPLICATE_IMAGE');
                contributingEvidence.push(file.id);
                anomalyDetails.perceptualDuplicate = {
                  fileId: file.id,
                  conflictingRequestRef: other.refundRequest.requestRef,
                  hammingDistance: distance,
                };
                break;
              }
            }
          }
        }

        // B3: Image EXIF delivery timeline contradiction
        if (file.imageAnalysis?.exifTimestamp && request.order.deliveredAt) {
          const photoTime = new Date(file.imageAnalysis.exifTimestamp).getTime();
          const deliveryTime = new Date(request.order.deliveredAt).getTime();
          if (photoTime < deliveryTime - 1000 * 60 * 60 * 2) {
            // Photo taken > 2 hours prior to delivery
            hasTimelineContradiction = true;
            scoreAccumulator += 20;
            detectedPatterns.push('EXIF_TIMELINE_CONTRADICTION');
            contributingEvidence.push(file.id);
            anomalyDetails.timelineContradiction = {
              photoCapturedAt: file.imageAnalysis.exifTimestamp,
              carrierDeliveredAt: request.order.deliveredAt,
            };
          }
        }

        // B4: Document OCR Contradiction
        if (file.documentAnalysis) {
          if (file.documentAnalysis.orderMatchStatus === 'CONTRADICTORY') {
            hasDocumentContradiction = true;
            scoreAccumulator += 25;
            detectedPatterns.push('DOCUMENT_ORDER_CONTRADICTION');
            contributingEvidence.push(file.id);
            anomalyDetails.documentContradiction = {
              fileId: file.id,
              inconsistencies: file.documentAnalysis.inconsistencies,
            };
          }

          // B5: Reused Invoice Number across different claims
          if (file.documentAnalysis.extractedInvoiceNo) {
            const sameInvoiceOtherClaim = await prisma.documentAnalysis.findFirst({
              where: {
                extractedInvoiceNo: file.documentAnalysis.extractedInvoiceNo,
                evidenceFile: {
                  refundRequestId: { not: request.id },
                },
              },
              include: {
                evidenceFile: {
                  include: { refundRequest: { select: { requestRef: true } } },
                },
              },
            });

            if (sameInvoiceOtherClaim) {
              scoreAccumulator += 25;
              detectedPatterns.push('REUSED_INVOICE_NUMBER_CROSS_CLAIM');
              contributingEvidence.push(file.id);
              anomalyDetails.reusedInvoice = {
                invoiceNo: file.documentAnalysis.extractedInvoiceNo,
                conflictingRequestRef:
                  sameInvoiceOtherClaim.evidenceFile.refundRequest.requestRef,
              };
            }
          }

          // B6: Document Extracted Amount Mismatch
          if (
            file.documentAnalysis.extractedAmount !== null &&
            file.documentAnalysis.extractedAmount !== undefined &&
            request.order.amount > 0 &&
            Math.abs(file.documentAnalysis.extractedAmount - request.order.amount) > 1000
          ) {
            hasDocumentContradiction = true;
            scoreAccumulator += 20;
            detectedPatterns.push('DOCUMENT_AMOUNT_MISMATCH');
            contributingEvidence.push(file.id);
            anomalyDetails.documentAmountMismatch = {
              fileId: file.id,
              extractedAmountCents: file.documentAnalysis.extractedAmount,
              orderBilledCents: request.order.amount,
            };
          }
        }
      }
    }

    // =========================================================================
    // 4. Dimension C: Product Intelligence Signals
    // =========================================================================
    const product = request.product;
    const totalProductOrders = product.orders.length;
    const totalProductClaims = product.refundRequests.length;
    const productClaimRate =
      totalProductOrders > 0 ? totalProductClaims / totalProductOrders : 0;

    if (totalProductOrders >= 4 && productClaimRate >= 0.25) {
      // Product-specific concentration: abnormal return rate on this SKU
      scoreAccumulator += 10;
      detectedPatterns.push('PRODUCT_HIGH_DEFECT_RATE');
      anomalyDetails.productConcentration = {
        sku: product.sku,
        name: product.name,
        claimRate: Number((productClaimRate * 100).toFixed(1)),
        claimsCount: totalProductClaims,
      };
    }

    // =========================================================================
    // 5. Dimension D: Delivery Verification Signals
    // =========================================================================
    let parsedDelivery: any = {};
    try {
      if (request.order.deliveryEvidence) {
        parsedDelivery = JSON.parse(request.order.deliveryEvidence);
      }
    } catch {}

    if (request.reason === 'NOT_RECEIVED') {
      // D1: NOT_RECEIVED claimed, but carrier confirms delivery with signature
      const isCarrierDelivered =
        request.order.fulfilmentStatus === 'DELIVERED' ||
        parsedDelivery.status === 'Delivered';
      const hasSignature = Boolean(parsedDelivery.signatureObtained);
      const gpsMatch = parsedDelivery.deliveryGpsMatch === true;

      if (isCarrierDelivered && hasSignature && gpsMatch) {
        scoreAccumulator += 30;
        detectedPatterns.push('NON_RECEIPT_CONTRADICTS_CARRIER_SIGNATURE');
        anomalyDetails.deliveryContradiction = {
          claimed: 'NOT_RECEIVED',
          carrierStatus: parsedDelivery.status,
          signatureObtained: true,
          gpsVerified: true,
        };
      } else if (isCarrierDelivered && gpsMatch) {
        scoreAccumulator += 15;
        detectedPatterns.push('NON_RECEIPT_CONTRADICTS_CONFIRMED_DELIVERY');
        anomalyDetails.deliveryContradiction = {
          claimed: 'NOT_RECEIVED',
          carrierStatus: parsedDelivery.status,
          gpsVerified: true,
        };
      }
    }

    // D2: Geofence discrepancy
    if (parsedDelivery.deliveryGpsMatch === false) {
      scoreAccumulator += 15;
      detectedPatterns.push('DELIVERY_GPS_GEOFENCE_MISMATCH');
      anomalyDetails.carrierGeofence =
        'Carrier scan coordinates deviate significantly from designated recipient address.';
    }

    // =========================================================================
    // 6. Unified Multi-Signal Risk Assessment & Calibration
    // =========================================================================
    const fraudScore = Math.max(0, Math.min(100, Math.round(scoreAccumulator)));

    let riskTier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (fraudScore >= 80) riskTier = 'CRITICAL';
    else if (fraudScore >= 55) riskTier = 'HIGH';
    else if (fraudScore >= 30) riskTier = 'MODERATE';
    else riskTier = 'LOW';

    let dispositionProposal: 'PASS' | 'REVIEW' | 'REJECT' = 'PASS';
    let recommendedAction: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT' = 'APPROVE';

    if (riskTier === 'CRITICAL') {
      // Definite fraud patterns detected (e.g. reused invoice or contradictory signature + high score)
      if (hasDuplicateEvidence || hasDocumentContradiction) {
        dispositionProposal = 'REJECT';
        recommendedAction = 'REJECT';
      } else {
        dispositionProposal = 'REVIEW';
        recommendedAction = 'MANUAL_REVIEW';
      }
    } else if (riskTier === 'HIGH' || riskTier === 'MODERATE') {
      dispositionProposal = 'REVIEW';
      recommendedAction = 'MANUAL_REVIEW';
    } else {
      dispositionProposal = 'PASS';
      recommendedAction = 'APPROVE';
    }

    const calculationSummary =
      detectedPatterns.length > 0
        ? `Multi-signal risk score ${fraudScore}/100 (${riskTier}). Flagged patterns: ${detectedPatterns.join(', ')}.`
        : `Baseline low risk score ${fraudScore}/100 (${riskTier}). No active anomalies detected.`;

    // Persist into FraudEvaluation table
    await prisma.fraudEvaluation.upsert({
      where: { refundRequestId },
      update: {
        fraudScore,
        riskTier,
        detectedPatterns: JSON.stringify(detectedPatterns),
        anomalyDetails: JSON.stringify(anomalyDetails),
        contributingEvidence: JSON.stringify(contributingEvidence),
        missingInformation: JSON.stringify(missingInformation),
        recommendedAction,
        dispositionProposal,
      },
      create: {
        refundRequestId,
        fraudScore,
        riskTier,
        detectedPatterns: JSON.stringify(detectedPatterns),
        anomalyDetails: JSON.stringify(anomalyDetails),
        contributingEvidence: JSON.stringify(contributingEvidence),
        missingInformation: JSON.stringify(missingInformation),
        recommendedAction,
        dispositionProposal,
      },
    });

    return {
      fraudScore,
      riskTier,
      detectedPatterns,
      anomalyDetails,
      contributingEvidence,
      missingInformation,
      dispositionProposal,
      recommendedAction,
      calculationSummary,
    };
  }
}
