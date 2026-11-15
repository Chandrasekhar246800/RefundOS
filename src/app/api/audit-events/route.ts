import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') || undefined;
    const entityId = searchParams.get('entityId') || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const events = await prisma.auditEvent.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const parsed = events.map((e) => {
      let detailsObj = null;
      try {
        detailsObj = e.details ? JSON.parse(e.details) : null;
      } catch {
        detailsObj = e.details;
      }
      return {
        ...e,
        details: detailsObj,
      };
    });

    return NextResponse.json({ success: true, data: parsed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
