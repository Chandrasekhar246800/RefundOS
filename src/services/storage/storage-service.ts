import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  FileValidationResult,
  StorageFileMetadata,
  StorageUploadResult,
  StoredFileType,
} from '@/types';

export class StorageService {
  private static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
  private static readonly ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

  /**
   * Resolves and ensures the root storage directory exists safely.
   */
  public static getStorageRootDir(): string {
    const configuredPath = process.env.EVIDENCE_STORAGE_PATH;
    const rootDir = configuredPath
      ? path.resolve(configuredPath)
      : path.resolve(process.cwd(), 'storage', 'evidence');

    if (!fsSync.existsSync(rootDir)) {
      fsSync.mkdirSync(rootDir, { recursive: true });
    }

    return rootDir;
  }

  /**
   * Calculates SHA-256 hash of a buffer.
   */
  public static calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Verifies file magic bytes (file signature) to prevent extension spoofing.
   */
  public static verifyFileSignature(buffer: Buffer): {
    valid: boolean;
    detectedMime?: string;
    detectedType?: StoredFileType;
  } {
    if (!buffer || buffer.length < 4) {
      return { valid: false };
    }

    // PNG: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return { valid: true, detectedMime: 'image/png', detectedType: 'IMAGE' };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true, detectedMime: 'image/jpeg', detectedType: 'IMAGE' };
    }

    // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { valid: true, detectedMime: 'image/webp', detectedType: 'IMAGE' };
    }

    // PDF: 25 50 44 46 (%PDF)
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return { valid: true, detectedMime: 'application/pdf', detectedType: 'DOCUMENT' };
    }

    return { valid: false };
  }

  /**
   * Validates file size, extension, and content magic bytes.
   */
  public static validateFile(
    originalFileName: string,
    buffer: Buffer
  ): FileValidationResult {
    if (!buffer || buffer.length === 0) {
      return { valid: false, error: 'File buffer is empty.' };
    }

    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds the 10 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
      };
    }

    const ext = path.extname(originalFileName).toLowerCase();
    if (!this.ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `File extension '${ext}' is not permitted. Allowed: ${Array.from(this.ALLOWED_EXTENSIONS).join(', ')}`,
      };
    }

    // Check magic bytes
    const signature = this.verifyFileSignature(buffer);
    if (!signature.valid || !signature.detectedMime) {
      return {
        valid: false,
        error: 'File content does not match allowed MIME types (PNG, JPEG, WebP, PDF). Header verification failed.',
      };
    }

    // Check extension vs signature consistency
    if (signature.detectedMime === 'application/pdf' && ext !== '.pdf') {
      return { valid: false, error: 'File content is PDF but extension is not .pdf' };
    }
    if (signature.detectedMime === 'image/png' && ext !== '.png') {
      return { valid: false, error: 'File content is PNG but extension is not .png' };
    }
    if (
      signature.detectedMime === 'image/jpeg' &&
      ext !== '.jpg' &&
      ext !== '.jpeg'
    ) {
      return { valid: false, error: 'File content is JPEG but extension is not .jpg/.jpeg' };
    }
    if (signature.detectedMime === 'image/webp' && ext !== '.webp') {
      return { valid: false, error: 'File content is WebP but extension is not .webp' };
    }

    const sanitizedBase = path
      .basename(originalFileName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const sanitizedFileName = `${sanitizedBase}${ext}`;
    const fileHash = this.calculateHash(buffer);

    return {
      valid: true,
      mimeType: signature.detectedMime,
      fileType: signature.detectedType,
      sanitizedFileName,
      fileHash,
    };
  }

  /**
   * Validates path traversal safety. Ensures target path resides strictly inside rootDir.
   */
  public static assertSafePath(targetPath: string): string {
    const rootDir = this.getStorageRootDir();
    const resolved = path.resolve(targetPath);

    if (!resolved.startsWith(rootDir)) {
      throw new Error(`Security Violation: Path traversal attempt detected outside storage boundary: ${targetPath}`);
    }

    return resolved;
  }

  /**
   * Uploads and securely stores an evidence file for a refund request.
   */
  public static async storeEvidenceFile(
    refundRequestId: string,
    originalFileName: string,
    buffer: Buffer,
    actor: string = 'demo_operator'
  ): Promise<StorageUploadResult> {
    // 1. Verify refund request exists
    const request = await prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { id: true, requestRef: true },
    });

    if (!request) {
      return { success: false, error: `Refund request '${refundRequestId}' not found.` };
    }

    // 2. Validate file integrity and content
    const validation = this.validateFile(originalFileName, buffer);
    if (!validation.valid || !validation.fileHash || !validation.mimeType || !validation.fileType) {
      return { success: false, error: validation.error || 'File validation failed.' };
    }

    // 3. Duplicate check within same refund request
    const existingSameRequest = await prisma.evidenceFile.findFirst({
      where: {
        refundRequestId,
        fileHash: validation.fileHash,
      },
    });

    if (existingSameRequest) {
      return {
        success: true,
        isDuplicate: true,
        duplicateOfId: existingSameRequest.id,
        file: {
          id: existingSameRequest.id,
          refundRequestId: existingSameRequest.refundRequestId,
          fileType: existingSameRequest.fileType as StoredFileType,
          fileName: existingSameRequest.fileName,
          filePath: existingSameRequest.filePath,
          fileSize: existingSameRequest.fileSize,
          mimeType: existingSameRequest.mimeType,
          fileHash: existingSameRequest.fileHash,
          uploadedAt: existingSameRequest.uploadedAt.toISOString(),
        },
      };
    }

    // 4. Generate safe unique file path
    const rootDir = this.getStorageRootDir();
    const requestFolder = path.join(rootDir, refundRequestId);
    await fs.mkdir(requestFolder, { recursive: true });

    const safeFileId = `ev_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(validation.sanitizedFileName!);
    const storedFileName = `${safeFileId}${ext}`;
    const absoluteTarget = path.join(requestFolder, storedFileName);
    const relativeTarget = path.join(refundRequestId, storedFileName);

    // Assert traversal safety
    this.assertSafePath(absoluteTarget);

    // 5. Write file atomically to disk
    await fs.writeFile(absoluteTarget, buffer);

    // 6. Record EvidenceFile in database & AuditEvent
    const evidenceRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.evidenceFile.create({
        data: {
          refundRequestId,
          fileType: validation.fileType!,
          fileName: validation.sanitizedFileName!,
          filePath: relativeTarget,
          fileSize: buffer.length,
          mimeType: validation.mimeType!,
          fileHash: validation.fileHash!,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: 'EVIDENCE_FILE',
          entityId: record.id,
          eventType: 'UPLOADED',
          actor,
          details: JSON.stringify({
            refundRequestId,
            requestRef: request.requestRef,
            fileName: validation.sanitizedFileName,
            fileSize: buffer.length,
            mimeType: validation.mimeType,
            fileHash: validation.fileHash,
          }),
        },
      });

      return record;
    });

    return {
      success: true,
      file: {
        id: evidenceRecord.id,
        refundRequestId: evidenceRecord.refundRequestId,
        fileType: evidenceRecord.fileType as StoredFileType,
        fileName: evidenceRecord.fileName,
        filePath: evidenceRecord.filePath,
        fileSize: evidenceRecord.fileSize,
        mimeType: evidenceRecord.mimeType,
        fileHash: evidenceRecord.fileHash,
        uploadedAt: evidenceRecord.uploadedAt.toISOString(),
      },
    };
  }

  /**
   * Retrieves an evidence file's physical content buffer safely.
   */
  public static async getEvidenceFileContent(fileId: string): Promise<{
    buffer: Buffer;
    record: StorageFileMetadata;
  }> {
    const record = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });

    if (!record) {
      throw new Error(`Evidence file '${fileId}' not found.`);
    }

    const rootDir = this.getStorageRootDir();
    const absolutePath = path.join(rootDir, record.filePath);
    this.assertSafePath(absolutePath);

    try {
      const buffer = await fs.readFile(absolutePath);
      return {
        buffer,
        record: {
          id: record.id,
          refundRequestId: record.refundRequestId,
          fileType: record.fileType as StoredFileType,
          fileName: record.fileName,
          filePath: record.filePath,
          fileSize: record.fileSize,
          mimeType: record.mimeType,
          fileHash: record.fileHash,
          uploadedAt: record.uploadedAt.toISOString(),
        },
      };
    } catch (err: any) {
      throw new Error(`Failed to read evidence file from disk: ${err.message}`);
    }
  }

  /**
   * Safely deletes an evidence file and writes an audit log.
   */
  public static async deleteEvidenceFile(
    fileId: string,
    actor: string = 'demo_operator'
  ): Promise<{ success: boolean; message: string }> {
    const record = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });

    if (!record) {
      throw new Error(`Evidence file '${fileId}' not found.`);
    }

    const rootDir = this.getStorageRootDir();
    const absolutePath = path.join(rootDir, record.filePath);
    this.assertSafePath(absolutePath);

    // Delete from disk if exists
    try {
      await fs.unlink(absolutePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Error removing file from disk: ${err.message}`);
      }
    }

    // Delete record from database and write audit event
    await prisma.$transaction(async (tx) => {
      await tx.evidenceFile.delete({
        where: { id: fileId },
      });

      await tx.auditEvent.create({
        data: {
          entityType: 'EVIDENCE_FILE',
          entityId: fileId,
          eventType: 'DELETED',
          actor,
          details: JSON.stringify({
            refundRequestId: record.refundRequestId,
            fileName: record.fileName,
            fileHash: record.fileHash,
          }),
        },
      });
    });

    return {
      success: true,
      message: `Evidence file '${fileId}' deleted successfully.`,
    };
  }

  /**
   * Lists all evidence files attached to a refund request with intelligence records.
   */
  public static async listEvidenceFiles(refundRequestId: string): Promise<any[]> {
    const files = await prisma.evidenceFile.findMany({
      where: { refundRequestId },
      include: {
        imageAnalysis: true,
        documentAnalysis: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return files.map((f) => ({
      id: f.id,
      refundRequestId: f.refundRequestId,
      fileType: f.fileType as StoredFileType,
      fileName: f.fileName,
      filePath: f.filePath,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      fileHash: f.fileHash,
      perceptualHash: f.perceptualHash,
      uploadedAt: f.uploadedAt.toISOString(),
      imageAnalysis: f.imageAnalysis,
      documentAnalysis: f.documentAnalysis
        ? {
            ...f.documentAnalysis,
            inconsistencies: f.documentAnalysis.inconsistencies
              ? JSON.parse(f.documentAnalysis.inconsistencies)
              : [],
          }
        : null,
    }));
  }
}
