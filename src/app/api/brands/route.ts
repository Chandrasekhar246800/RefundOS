import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const BrandCreateSchema = z.object({
  name: z.string().min(2, 'Brand name must be at least 2 characters'),
  category: z.string().min(2, 'Category is required'),
  description: z.string().optional(),
  currency: z.string().default('USD'),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const brands = await prisma.brand.findMany({
      where: status ? { status } : undefined,
      include: {
        _count: {
          select: { products: true, orders: true, batches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: brands });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = BrandCreateSchema.parse(body);

    // Prevent duplicate brand name
    const existing = await prisma.brand.findUnique({
      where: { name: validated.name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Brand "${validated.name}" already exists.` },
        { status: 409 }
      );
    }

    const brand = await prisma.brand.create({
      data: {
        name: validated.name,
        category: validated.category,
        description: validated.description,
        currency: validated.currency,
        status: 'ACTIVE',
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'BRAND',
        entityId: brand.id,
        eventType: 'CREATED',
        details: JSON.stringify(brand),
      },
    });

    return NextResponse.json({ success: true, data: brand }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
