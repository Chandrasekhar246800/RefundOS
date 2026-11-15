import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CustomerRiskService } from '@/services/intelligence/customer-risk-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        orders: {
          orderBy: { purchasedAt: 'desc' },
          include: { product: true },
        },
        refundRequests: {
          orderBy: { requestedAt: 'desc' },
          include: {
            order: true,
            decision: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: `Customer '${params.id}' not found.` },
        { status: 404 }
      );
    }

    const riskService = new CustomerRiskService();
    const profile = await riskService.getCustomerRiskProfile(params.id);

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          syntheticCustomerRef: customer.syntheticCustomerRef,
          accountCreatedAt: customer.accountCreatedAt,
          priorRefundCount: customer.priorRefundCount,
          priorReturnCount: customer.priorReturnCount,
          priorChargebackCount: customer.priorChargebackCount,
        },
        riskProfile: profile,
        orders: customer.orders,
        refundRequests: customer.refundRequests,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
