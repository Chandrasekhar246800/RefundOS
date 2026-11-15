import { prisma } from '@/lib/prisma';
import { ConfusionMatrixMetrics } from '@/types';

export class MetricsService {
  /**
   * Computes comprehensive dashboard metrics from live persisted records.
   */
  static async getDashboardMetrics(filters?: {
    brandId?: string;
    productId?: string;
    batchId?: string;
  }) {
    const whereClause: any = {};
    if (filters?.brandId) {
      whereClause.product = { brandId: filters.brandId };
    }
    if (filters?.productId) {
      whereClause.productId = filters.productId;
    }
    if (filters?.batchId) {
      whereClause.batchId = filters.batchId;
    }

    const [
      totalBrands,
      totalProducts,
      totalRequests,
      statusCounts,
      approvedTransactions,
      rejectedRequests,
      recentBatches,
      allDecidedRequests,
    ] = await Promise.all([
      prisma.brand.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.refundRequest.count({ where: whereClause }),
      prisma.refundRequest.groupBy({
        by: ['status'],
        where: whereClause,
        _count: { status: true },
      }),
      prisma.refundTransaction.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: filters?.brandId || filters?.productId || filters?.batchId
          ? {
              refundRequest: whereClause,
            }
          : undefined,
      }),
      prisma.refundRequest.aggregate({
        _sum: { requestedAmount: true },
        _count: { id: true },
        where: { ...whereClause, status: 'REJECTED' },
      }),
      prisma.processingBatch.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          brand: { select: { name: true } },
          product: { select: { name: true, sku: true } },
        },
      }),
      prisma.refundRequest.findMany({
        where: {
          ...whereClause,
          status: { in: ['APPROVED', 'REJECTED', 'MANUAL_REVIEW'] },
        },
        select: {
          status: true,
          groundTruthLabel: true,
        },
      }),
    ]);

    const counts: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      APPROVED: 0,
      REJECTED: 0,
      MANUAL_REVIEW: 0,
      FAILED: 0,
    };

    statusCounts.forEach((sc) => {
      counts[sc.status] = sc._count.status;
    });

    const totalDecided = counts.APPROVED + counts.REJECTED + counts.MANUAL_REVIEW;
    const approvalRate = totalDecided > 0 ? (counts.APPROVED / totalDecided) * 100 : 0;
    const rejectionRate = totalDecided > 0 ? (counts.REJECTED / totalDecided) * 100 : 0;
    const manualReviewRate = totalDecided > 0 ? (counts.MANUAL_REVIEW / totalDecided) * 100 : 0;

    const totalSimulatedApprovedAmount = approvedTransactions._sum.amount || 0;
    const totalSimulatedRejectedAmount = rejectedRequests._sum.requestedAmount || 0;

    // Calculate Confusion Matrix against ground truth
    const confusion = this.calculateConfusionMatrix(allDecidedRequests);

    return {
      overview: {
        totalBrands,
        totalProducts,
        totalRequests,
        pendingCount: counts.PENDING,
        processingCount: counts.PROCESSING,
        approvedCount: counts.APPROVED,
        rejectedCount: counts.REJECTED,
        manualReviewCount: counts.MANUAL_REVIEW,
        failedCount: counts.FAILED,
        approvalRate: Number(approvalRate.toFixed(1)),
        rejectionRate: Number(rejectionRate.toFixed(1)),
        manualReviewRate: Number(manualReviewRate.toFixed(1)),
        totalSimulatedApprovedAmount, // in minor units
        totalSimulatedRejectedAmount, // in minor units
      },
      confusionMatrix: confusion,
      recentBatches,
    };
  }

  /**
   * Generates a detailed batch report.
   */
  static async getBatchReport(batchId: string) {
    const batch = await prisma.processingBatch.findUnique({
      where: { id: batchId },
      include: {
        brand: true,
        product: true,
        requests: {
          include: {
            order: true,
            customer: true,
            product: true,
            decision: true,
            transaction: true,
          },
          orderBy: { requestedAt: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found.`);
    }

    const durationSeconds =
      batch.startedAt && batch.completedAt
        ? Math.max(0, Math.round((batch.completedAt.getTime() - batch.startedAt.getTime()) / 1000))
        : null;

    let totalSimulatedApproved = 0;
    let totalRejectedAmount = 0;

    const decidedRequests: Array<{ status: string; groundTruthLabel: string }> = [];

    const requestDetails = batch.requests.map((r) => {
      if (r.status === 'APPROVED' && r.transaction) {
        totalSimulatedApproved += r.transaction.amount;
      }
      if (r.status === 'REJECTED') {
        totalRejectedAmount += r.requestedAmount;
      }
      if (['APPROVED', 'REJECTED', 'MANUAL_REVIEW'].includes(r.status)) {
        decidedRequests.push({ status: r.status, groundTruthLabel: r.groundTruthLabel });
      }

      return {
        id: r.id,
        requestRef: r.requestRef,
        orderRef: r.order.orderRef,
        customerRef: r.customer.syntheticCustomerRef,
        productName: r.product.name,
        productSku: r.product.sku,
        requestedAmount: r.requestedAmount,
        currency: r.currency,
        reason: r.reason,
        requestedAt: r.requestedAt,
        status: r.status,
        groundTruthLabel: r.groundTruthLabel,
        decision: r.decision?.decision || null,
        riskScore: r.decision?.riskScore ?? null,
        confidence: r.decision?.confidence ?? null,
        rationale: r.decision?.rationale || null,
        reasonCodes: r.decision ? JSON.parse(r.decision.reasonCodes) : [],
        transactionReference: r.transaction?.reference || null,
      };
    });

    const confusionMatrix = this.calculateConfusionMatrix(decidedRequests);

    return {
      batch: {
        id: batch.id,
        brandName: batch.brand.name,
        productName: batch.product?.name || 'All Products',
        productSku: batch.product?.sku || null,
        status: batch.status,
        provider: batch.provider,
        totalCount: batch.totalCount,
        processedCount: batch.processedCount,
        approvedCount: batch.approvedCount,
        rejectedCount: batch.rejectedCount,
        manualReviewCount: batch.manualReviewCount,
        failedCount: batch.failedCount,
        totalSimulatedApprovedAmount: totalSimulatedApproved,
        totalSimulatedRejectedAmount: totalRejectedAmount,
        durationSeconds,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        createdAt: batch.createdAt,
      },
      confusionMatrix,
      requests: requestDetails,
    };
  }

  /**
   * Evaluates precision, recall, accuracy, and confusion matrix against synthetic ground truth.
   * Positive class = 'LEGITIMATE request APPROVED'
   */
  static calculateConfusionMatrix(
    requests: Array<{ status: string; groundTruthLabel: string }>
  ): ConfusionMatrixMetrics {
    let totalLegitimate = 0;
    let totalNonLegitimate = 0;
    let tp = 0; // Legitimate approved
    let fp = 0; // Non-legitimate approved (high risk error)
    let tn = 0; // Non-legitimate rejected
    let fn = 0; // Legitimate rejected
    let mrLegit = 0; // Legitimate routed to review
    let mrNonLegit = 0; // Non-legitimate routed to review

    for (const req of requests) {
      const isLegit = req.groundTruthLabel === 'LEGITIMATE';
      if (isLegit) totalLegitimate++;
      else totalNonLegitimate++;

      if (req.status === 'APPROVED') {
        if (isLegit) tp++;
        else fp++;
      } else if (req.status === 'REJECTED') {
        if (!isLegit) tn++;
        else fn++;
      } else if (req.status === 'MANUAL_REVIEW') {
        if (isLegit) mrLegit++;
        else mrNonLegit++;
      }
    }

    const evaluatedDefinitive = tp + tn + fp + fn;
    const accuracy = evaluatedDefinitive > 0 ? (tp + tn) / evaluatedDefinitive : 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      totalLegitimateGroundTruth: totalLegitimate,
      totalNonLegitimateGroundTruth: totalNonLegitimate,
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      manualReviewLegitimate: mrLegit,
      manualReviewNonLegitimate: mrNonLegit,
      totalManualReviews: mrLegit + mrNonLegit,
      accuracy: Number((accuracy * 100).toFixed(1)),
      precision: Number((precision * 100).toFixed(1)),
      recall: Number((recall * 100).toFixed(1)),
      f1Score: Number((f1Score * 100).toFixed(1)),
    };
  }
}
