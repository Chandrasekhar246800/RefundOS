import { NextResponse } from 'next/server';
import { CustomerRiskService } from '@/services/intelligence/customer-risk-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const riskService = new CustomerRiskService();
    const updatedProfile = await riskService.evaluateCustomerRisk(params.id);

    return NextResponse.json({
      success: true,
      data: updatedProfile,
      message: `Customer risk profile recalculated successfully.`,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
