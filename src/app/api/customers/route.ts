import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CustomerRiskService } from '@/services/intelligence/customer-risk-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tier = searchParams.get('tier') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.syntheticCustomerRef = { contains: search };
    }
    if (tier) {
      where.riskProfile = { riskTier: tier };
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: {
          riskProfile: true,
          orders: {
            take: 3,
            orderBy: { purchasedAt: 'desc' },
            include: { product: { select: { name: true, sku: true } } },
          },
          refundRequests: {
            take: 3,
            orderBy: { requestedAt: 'desc' },
            select: { id: true, requestRef: true, status: true, requestedAmount: true, requestedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Ensure risk profiles exist for returned customers
    const riskService = new CustomerRiskService();
    const enriched = await Promise.all(
      customers.map(async (c) => {
        let profile = c.riskProfile;
        if (!profile) {
          try {
            const evaluated = await riskService.evaluateCustomerRisk(c.id);
            profile = await prisma.customerRiskProfile.findUnique({
              where: { customerId: c.id },
            });
          } catch {}
        }
        return {
          ...c,
          riskProfile: profile,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
