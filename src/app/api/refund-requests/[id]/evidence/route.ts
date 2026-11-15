import { NextResponse } from 'next/server';
import { StorageService } from '@/services/storage/storage-service';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const files = await StorageService.listEvidenceFiles(params.id);
    return NextResponse.json({ success: true, data: files });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await request.formData();
    const uploadedFiles = formData.getAll('file') as File[];
    const actor = (formData.get('actor') as string) || 'demo_operator';

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided in upload request.' },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const file of uploadedFiles) {
      if (typeof file === 'string') continue;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await StorageService.storeEvidenceFile(
        params.id,
        file.name,
        buffer,
        actor
      );

      if (result.success) {
        results.push(result);
      } else {
        errors.push({ fileName: file.name, error: result.error });
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0].error,
          errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed ${results.length} file(s).`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
