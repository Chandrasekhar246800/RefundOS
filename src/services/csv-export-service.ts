export class CsvExportService {
  /**
   * Generates CSV string for a batch report or refund requests list.
   */
  static generateBatchReportCsv(batchReport: any): string {
    const headers = [
      'Request ID',
      'Order Ref',
      'Customer Ref',
      'Product Name',
      'Product SKU',
      'Requested Amount',
      'Currency',
      'Reason',
      'Request Date',
      'Status',
      'AI Decision',
      'Risk Score',
      'Confidence',
      'Synthetic Ground Truth',
      'AI Rationale',
      'Reason Codes',
      'Simulated Transaction Ref',
    ];

    const rows = batchReport.requests.map((r: any) => [
      r.requestRef,
      r.orderRef,
      r.customerRef,
      `"${r.productName.replace(/"/g, '""')}"`,
      r.productSku,
      (r.requestedAmount / 100).toFixed(2),
      r.currency,
      r.reason,
      new Date(r.requestedAt).toISOString(),
      r.status,
      r.decision || 'N/A',
      r.riskScore !== null ? r.riskScore : 'N/A',
      r.confidence !== null ? `${(r.confidence * 100).toFixed(1)}%` : 'N/A',
      r.groundTruthLabel,
      `"${(r.rationale || '').replace(/"/g, '""')}"`,
      `"${(r.reasonCodes || []).join('; ')}"`,
      r.transactionReference || 'NONE',
    ]);

    const headerLine = headers.join(',');
    const rowLines = rows.map((row: any[]) => row.join(',')).join('\n');

    const summaryLines = [
      '',
      '--- BATCH SUMMARY METRICS (SIMULATED DEMO ENVIRONMENT) ---',
      `Batch ID,${batchReport.batch.id}`,
      `Brand,${batchReport.batch.brandName}`,
      `Product,${batchReport.batch.productName}`,
      `Provider Used,${batchReport.batch.provider}`,
      `Total Requests,${batchReport.batch.totalCount}`,
      `Approved Count,${batchReport.batch.approvedCount}`,
      `Rejected Count,${batchReport.batch.rejectedCount}`,
      `Manual Review Count,${batchReport.batch.manualReviewCount}`,
      `Total Simulated Approved Amount,$${(batchReport.batch.totalSimulatedApprovedAmount / 100).toFixed(2)}`,
      `True Positives (Legitimate Approved),${batchReport.confusionMatrix.truePositives}`,
      `False Positives (Non-Legitimate Approved),${batchReport.confusionMatrix.falsePositives}`,
      `True Negatives (Non-Legitimate Rejected),${batchReport.confusionMatrix.trueNegatives}`,
      `False Negatives (Legitimate Rejected),${batchReport.confusionMatrix.falseNegatives}`,
      `Accuracy,${batchReport.confusionMatrix.accuracy}%`,
      `Precision,${batchReport.confusionMatrix.precision}%`,
      `Recall,${batchReport.confusionMatrix.recall}%`,
      `F1 Score,${batchReport.confusionMatrix.f1Score}%`,
    ].join('\n');

    return `${headerLine}\n${rowLines}\n${summaryLines}`;
  }
}
