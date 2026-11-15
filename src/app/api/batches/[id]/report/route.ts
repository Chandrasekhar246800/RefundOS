import { NextResponse } from 'next/server';
import { MetricsService } from '@/services/metrics-service';
import { CsvExportService } from '@/services/csv-export-service';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const report = await MetricsService.getBatchReport(params.id);

    if (format === 'csv') {
      const csv = CsvExportService.generateBatchReportCsv(report);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="refund_batch_report_${params.id}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
