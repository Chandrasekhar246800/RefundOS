import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const BrandUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  category: z.string().min(2).optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: params.id },
      include: {
        products: {
          include: {
            _count: { select: { refundRequests: true } },
          },
        },
      },
    });

    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: brand });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = BrandUpdateSchema.parse(body);

    const brand = await prisma.brand.update({
      where: { id: params.id },
      data: validated,
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BRAND',
        entityId: brand.id,
        eventType: 'UPDATED',
        details: JSON.stringify(validated),
      },
    });

    return NextResponse.json({ success: true, data: brand });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Soft delete/archive
    const brand = await prisma.brand.update({
      where: { id: params.id },
      data: { status: 'ARCHIVED' },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BRAND',
        entityId: brand.id,
        eventType: 'ARCHIVED',
        details: JSON.stringify({ message: 'Brand archived' }),
      },
    });

    return NextResponse.json({ success: true, data: brand });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
