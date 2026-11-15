import { describe, it, expect } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { SyntheticDataService } from '../src/services/synthetic-data-service';
import { DecisionEngine } from '../src/services/decision-engine';
import { BatchProcessingService } from '../src/services/batch-processing-service';
import { MetricsService } from '../src/services/metrics-service';
import { CsvExportService } from '../src/services/csv-export-service';

describe('Complete End-to-End Workflow & Safety Guarantees', () => {
  it('Full E2E Flow: Seed -> 10+10 Generation -> Batch Processing -> Safety Rules -> Confusion Matrix -> CSV Export', async () => {
    // 1. Audit Seed
    const brandCount = await prisma.brand.count();
    const productCount = await prisma.product.count();
    const policy = await prisma.refundPolicy.findFirst({ where: { active: true } });

    expect(brandCount).toBeGreaterThanOrEqual(4);
    expect(productCount).toBeGreaterThanOrEqual(12);
    expect(policy).not.toBeNull();
    expect(policy!.version).toBe('v1.0');

    // 2. Select Test Product
    const testProduct = await prisma.product.findFirst({
      where: { sku: 'AUR-MER-001' },
      include: { brand: true },
    });
    expect(testProduct).not.toBeNull();

    // 3. Generate 10+10 Dataset
    const genResult = await SyntheticDataService.generateRequests({
      brandId: testProduct!.brandId,
      productId: testProduct!.id,
      legitimateCount: 10,
      nonLegitimateCount: 10,
      seed: 'e2e-vitest-seed-99',
      dryRun: false,
    });

    expect(genResult.batchId).toBeDefined();
    expect(genResult.totalGenerated).toBe(20);
    expect(genResult.legitimateCount).toBe(10);
    expect(genResult.nonLegitimateCount).toBe(10);

    // 4. Verify Ground Truth Isolation
    const sampleRequest = await prisma.refundRequest.findFirst({
      where: { batchId: genResult.batchId },
      include: { order: true, customer: true, product: true },
    });
    expect(sampleRequest).not.toBeNull();

    const evidencePacket = DecisionEngine.buildEvidencePacket(
      sampleRequest,
      sampleRequest!.order,
      sampleRequest!.customer,
      sampleRequest!.product
    );

    const packetJson = JSON.stringify(evidencePacket);
    expect(packetJson).not.toContain('LEGITIMATE');
    expect(packetJson).not.toContain('NON_LEGITIMATE');
    expect(packetJson).not.toContain('groundTruth');

    // 5. Execute Batch Processing synchronously for testing
    const batchRequests = await prisma.refundRequest.findMany({
      where: { batchId: genResult.batchId },
    });

    for (const req of batchRequests) {
      await DecisionEngine.processSingleRequest(req.id, 'LOCAL_DEMO');
    }
    await BatchProcessingService.refreshBatchCounts(genResult.batchId);

    const updatedBatch = await prisma.processingBatch.findUnique({
      where: { id: genResult.batchId },
    });
    expect(updatedBatch!.processedCount).toBe(20);

    // 6. Verify Financial & State Transition Safety
    const approvedRequests = await prisma.refundRequest.findMany({
      where: { batchId: genResult.batchId, status: 'APPROVED' },
      include: { transaction: true },
    });

    const rejectedRequests = await prisma.refundRequest.findMany({
      where: { batchId: genResult.batchId, status: 'REJECTED' },
      include: { transaction: true },
    });

    const reviewRequests = await prisma.refundRequest.findMany({
      where: { batchId: genResult.batchId, status: 'MANUAL_REVIEW' },
      include: { transaction: true },
    });

    expect(approvedRequests.length).toBeGreaterThan(0);
    for (const ar of approvedRequests) {
      expect(ar.transaction).not.toBeNull();
      expect(ar.transaction!.status).toBe('SIMULATED_COMPLETED');
      expect(ar.transaction!.reference).toContain('SIM-TXN-');
    }

    for (const rr of rejectedRequests) {
      expect(rr.transaction).toBeNull();
    }

    for (const mr of reviewRequests) {
      expect(mr.transaction).toBeNull();
    }

    // 7. Verify Idempotency
    const initialTxnCount = await prisma.refundTransaction.count();
    if (approvedRequests.length > 0) {
      await DecisionEngine.processSingleRequest(approvedRequests[0].id, 'LOCAL_DEMO');
    }
    const finalTxnCount = await prisma.refundTransaction.count();
    expect(finalTxnCount).toBe(initialTxnCount);

    // 8. Verify Batch Report & Confusion Matrix
    const report = await MetricsService.getBatchReport(genResult.batchId);
    expect(report.batch.totalCount).toBe(20);
    expect(report.batch.processedCount).toBe(20);
    expect(report.confusionMatrix.accuracy).toBeGreaterThan(0);
    expect(report.confusionMatrix.precision).toBeGreaterThan(0);
    expect(report.confusionMatrix.recall).toBeGreaterThan(0);
    expect(report.requests.length).toBe(20);

    // 9. Verify CSV Export
    const csv = CsvExportService.generateBatchReportCsv(report);
    expect(csv).toContain('Request ID,Order Ref,Customer Ref');
    expect(csv).toContain('BATCH SUMMARY METRICS');
    expect(csv).toContain(genResult.batchId);

    // 10. Audit Trail
    const auditCount = await prisma.auditEvent.count({
      where: { entityId: genResult.batchId },
    });
    expect(auditCount).toBeGreaterThanOrEqual(1);
  });
});
