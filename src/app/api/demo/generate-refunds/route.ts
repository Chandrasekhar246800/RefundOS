import { NextResponse } from 'next/server';
import { SyntheticDataService } from '@/services/synthetic-data-service';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const GenerateSchema = z.object({
  brandId: z.string().optional(),
  productId: z.string().optional(),
  legitimateCount: z.number().int().min(1).max(50).default(10),
  nonLegitimateCount: z.number().int().min(1).max(50).default(10),
  seed: z.union([z.string(), z.number()]).default(42),
  dryRun: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = GenerateSchema.parse(body);

    let brandId = validated.brandId;
    let productId = validated.productId;

    if (!productId || !brandId) {
      const defaultProduct = await prisma.product.findFirst({
        where: { status: 'ACTIVE' },
        include: { brand: true },
      });
      if (!defaultProduct) {
        throw new Error('No active products found in catalog. Create a brand and product first.');
      }
      productId = defaultProduct.id;
      brandId = defaultProduct.brandId;
    }

    const result: any = await SyntheticDataService.generateRequests({
      brandId,
      productId,
      legitimateCount: validated.legitimateCount,
      nonLegitimateCount: validated.nonLegitimateCount,
      seed: validated.seed,
      dryRun: validated.dryRun,
    });

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
