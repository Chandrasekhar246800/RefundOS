import { prisma } from '@/lib/prisma';
import { DecisionEngine } from './decision-engine';
import { DecisionProviderFactory } from './decision-providers/factory';

export class BatchProcessingService {
  /**
   * Processes a batch of refund requests.
   */
  static async processBatch(
    batchId: string,
    requestIds?: string[],
    forcedProvider?: string
  ): Promise<{ batchId: string; totalQueued: number }> {
    const batch = await prisma.processingBatch.findUnique({
      where: { id: batchId },
      include: { requests: true },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found.`);
    }

    // Determine target requests: either specific IDs or all pending/failed in batch
    let eligibleRequests = batch.requests;
    if (requestIds && requestIds.length > 0) {
      const idSet = new Set(requestIds);
      eligibleRequests = batch.requests.filter((r) => idSet.has(r.id));
    } else {
      eligibleRequests = batch.requests.filter(
        (r) => r.status === 'PENDING' || r.status === 'FAILED'
      );
    }

    if (eligibleRequests.length === 0) {
      return { batchId, totalQueued: 0 };
    }

    const { providerName } = await DecisionProviderFactory.getProvider(forcedProvider);

    // Update batch status to PROCESSING
    await prisma.processingBatch.update({
      where: { id: batchId },
      data: {
        status: 'PROCESSING',
        provider: providerName,
        startedAt: batch.startedAt || new Date(),
        totalCount: batch.requests.length,
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BATCH',
        entityId: batchId,
        eventType: 'PROCESSING_STARTED',
        actor: 'demo_operator',
        details: JSON.stringify({
          eligibleCount: eligibleRequests.length,
          provider: providerName,
        }),
      },
    });

    // Run processing asynchronously (or execute sequence)
    // In Node.js / Next.js server, we run the loop and keep batch persisted
    this.runBatchLoop(batchId, eligibleRequests.map((r) => r.id), forcedProvider).catch((err) => {
      console.error(`Error in batch execution ${batchId}:`, err);
    });

    return {
      batchId,
      totalQueued: eligibleRequests.length,
    };
  }

  /**
   * Background runner for the batch items.
   */
  private static async runBatchLoop(
    batchId: string,
    requestIds: string[],
    forcedProvider?: string
  ) {
    for (const reqId of requestIds) {
      try {
        await DecisionEngine.processSingleRequest(reqId, forcedProvider);
      } catch (err) {
        console.error(`Error processing request ${reqId}:`, err);
      }

      // Update batch counts incrementally after each item
      await this.refreshBatchCounts(batchId);
    }

    // Mark batch COMPLETED
    await prisma.processingBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BATCH',
        entityId: batchId,
        eventType: 'PROCESSED',
        actor: 'system',
        details: JSON.stringify({
          batchId,
          completedAt: new Date().toISOString(),
        }),
      },
    });
  }

  /**
   * Refreshes the aggregated counts for a batch from persisted requests.
   */
  static async refreshBatchCounts(batchId: string) {
    const requests = await prisma.refundRequest.findMany({
      where: { batchId },
      select: { status: true },
    });

    const totalCount = requests.length;
    let approvedCount = 0;
    let rejectedCount = 0;
    let manualReviewCount = 0;
    let failedCount = 0;
    let processedCount = 0;

    for (const r of requests) {
      if (r.status === 'APPROVED') {
        approvedCount++;
        processedCount++;
      } else if (r.status === 'REJECTED') {
        rejectedCount++;
        processedCount++;
      } else if (r.status === 'MANUAL_REVIEW') {
        manualReviewCount++;
        processedCount++;
      } else if (r.status === 'FAILED') {
        failedCount++;
        processedCount++;
      }
    }

    await prisma.processingBatch.update({
      where: { id: batchId },
      data: {
        totalCount,
        processedCount,
        approvedCount,
        rejectedCount,
        manualReviewCount,
        failedCount,
      },
    });
  }

  /**
   * Retries only failed requests in a batch.
   */
  static async retryFailedRequests(batchId: string, forcedProvider?: string) {
    const failedRequests = await prisma.refundRequest.findMany({
      where: {
        batchId,
        status: 'FAILED',
      },
      select: { id: true },
    });

    if (failedRequests.length === 0) {
      return { retriedCount: 0, message: 'No failed requests found to retry in this batch.' };
    }

    const failedIds = failedRequests.map((r) => r.id);

    // Reset status to PENDING
    await prisma.refundRequest.updateMany({
      where: { id: { in: failedIds } },
      data: { status: 'PENDING' },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BATCH',
        entityId: batchId,
        eventType: 'RETRIED',
        actor: 'demo_operator',
        details: JSON.stringify({ retriedCount: failedIds.length }),
      },
    });

    await this.processBatch(batchId, failedIds, forcedProvider);

    return {
      retriedCount: failedIds.length,
      message: `Started retry for ${failedIds.length} failed request(s).`,
    };
  }
}
