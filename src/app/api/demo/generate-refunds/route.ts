import { NextResponse } from 'next/server';
import { SyntheticDataService } from '@/services/synthetic-data-service';
import { z } from 'zod';

const GenerateSchema = z.object({
  brandId: z.string().min(1, 'Brand ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  legitimateCount: z.number().int().min(1).max(50).default(10),
  nonLegitimateCount: z.number().int().min(1).max(50).default(10),
  seed: z.union([z.string(), z.number()]).default(42),
  dryRun: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = GenerateSchema.parse(body);

    const result: any = await SyntheticDataService.generateRequests(validated);

    const totalCount = result.totalGenerated ?? result.totalCount;

    return NextResponse.json({
      success: true,
      data: result,
      message: validated.dryRun
        ? `Generated dataset preview of ${totalCount} requests.`
        : `Successfully generated ${totalCount} requests (${result.legitimateCount} Legitimate + ${result.nonLegitimateCount} Non-Legitimate).`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
