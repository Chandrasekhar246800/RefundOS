import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StorageService } from '../src/services/storage/storage-service';
import { prisma } from '../src/lib/prisma';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('REFUND OS 2.0 - StorageService & Evidence Subsystem', () => {
  let testRequestId: string;
  const createdFileIds: string[] = [];

  // Minimal valid file buffers with authentic magic numbers
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0xff,
    0xd9, // EOI
  ]);

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
  );

  const fakeExecutableDisguisedAsPng = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, // MZ header (Windows EXE)
    0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
  ]);

  beforeAll(async () => {
    // Pick an existing refund request to attach test evidence to
    const existingReq = await prisma.refundRequest.findFirst();
    if (!existingReq) {
      throw new Error('No existing refund request found for storage testing.');
    }
    testRequestId = existingReq.id;
  });

  afterAll(async () => {
    // Clean up created test files from DB and disk
    for (const fileId of createdFileIds) {
      try {
        await StorageService.deleteEvidenceFile(fileId, 'test_cleanup');
      } catch {}
    }
  });

  it('RULE: SHA-256 hash must be deterministic and accurately computed', () => {
    const hash1 = StorageService.calculateHash(validPngBuffer);
    const hash2 = StorageService.calculateHash(validPngBuffer);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // Standard SHA-256 hex length
  });

  it('RULE: Content magic bytes must identify valid PNG, JPEG, and PDF', () => {
    const pngCheck = StorageService.verifyFileSignature(validPngBuffer);
    expect(pngCheck.valid).toBe(true);
    expect(pngCheck.detectedMime).toBe('image/png');
    expect(pngCheck.detectedType).toBe('IMAGE');

    const jpegCheck = StorageService.verifyFileSignature(validJpegBuffer);
    expect(jpegCheck.valid).toBe(true);
    expect(jpegCheck.detectedMime).toBe('image/jpeg');
    expect(jpegCheck.detectedType).toBe('IMAGE');

    const pdfCheck = StorageService.verifyFileSignature(validPdfBuffer);
    expect(pdfCheck.valid).toBe(true);
    expect(pdfCheck.detectedMime).toBe('application/pdf');
    expect(pdfCheck.detectedType).toBe('DOCUMENT');
  });

  it('RULE: Fake files with mismatched magic bytes must be strictly rejected', () => {
    const validation = StorageService.validateFile('damage_photo.png', fakeExecutableDisguisedAsPng);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Header verification failed');
  });

  it('RULE: Disallowed file extensions must be rejected', () => {
    const scriptBuffer = Buffer.from('console.log("malicious");');
    const validation = StorageService.validateFile('exploit.js', scriptBuffer);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('is not permitted');
  });

  it('RULE: Empty buffers must be rejected', () => {
    const validation = StorageService.validateFile('empty.png', Buffer.alloc(0));
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('buffer is empty');
  });

  it('RULE: Oversized files (> 10MB) must be rejected', () => {
    // 11MB fake buffer
    const hugeBuffer = Buffer.alloc(11 * 1024 * 1024);
    const validation = StorageService.validateFile('huge.png', hugeBuffer);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('exceeds the 10 MB limit');
  });

  it('RULE: Path traversal attempts must be blocked', () => {
    expect(() => {
      StorageService.assertSafePath('../../../windows/system32/cmd.exe');
    }).toThrow(/Security Violation: Path traversal attempt/);
  });

  it('RULE: Valid PNG evidence file must be saved to disk, recorded in DB, and audited', async () => {
    const uploadResult = await StorageService.storeEvidenceFile(
      testRequestId,
      'damaged_product_front.png',
      validPngBuffer,
      'qa_tester'
    );

    expect(uploadResult.success).toBe(true);
    expect(uploadResult.file).toBeDefined();
    expect(uploadResult.isDuplicate).toBeFalsy();

    const file = uploadResult.file!;
    createdFileIds.push(file.id);

    expect(file.fileName).toBe('damaged_product_front.png');
    expect(file.fileType).toBe('IMAGE');
    expect(file.mimeType).toBe('image/png');
    expect(file.fileSize).toBe(validPngBuffer.length);
    expect(file.fileHash).toBe(StorageService.calculateHash(validPngBuffer));

    // Verify DB persistence
    const dbRecord = await prisma.evidenceFile.findUnique({
      where: { id: file.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.refundRequestId).toBe(testRequestId);

    // Verify Audit Event
    const audit = await prisma.auditEvent.findFirst({
      where: {
        entityId: file.id,
        eventType: 'UPLOADED',
      },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actor).toBe('qa_tester');
  });

  it('RULE: Duplicate file upload for same refund request must be detected via SHA-256', async () => {
    // Upload the exact same file buffer a second time
    const secondUpload = await StorageService.storeEvidenceFile(
      testRequestId,
      'damaged_copy.png',
      validPngBuffer,
      'qa_tester'
    );

    expect(secondUpload.success).toBe(true);
    expect(secondUpload.isDuplicate).toBe(true);
    expect(secondUpload.duplicateOfId).toBeDefined();
    expect(secondUpload.file!.fileHash).toBe(StorageService.calculateHash(validPngBuffer));
  });

  it('RULE: Stored file content must be safely readable by ID', async () => {
    const fileId = createdFileIds[0];
    const { buffer, record } = await StorageService.getEvidenceFileContent(fileId);

    expect(buffer).toBeDefined();
    expect(buffer.length).toBe(validPngBuffer.length);
    expect(StorageService.calculateHash(buffer)).toBe(StorageService.calculateHash(validPngBuffer));
    expect(record.id).toBe(fileId);
  });

  it('RULE: Deleting evidence file removes it from disk and DB, writing an audit event', async () => {
    const fileId = createdFileIds[0];
    const deleteResult = await StorageService.deleteEvidenceFile(fileId, 'admin_operator');

    expect(deleteResult.success).toBe(true);

    // Verify DB removal
    const dbCheck = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });
    expect(dbCheck).toBeNull();

    // Verify Audit Event for deletion
    const deleteAudit = await prisma.auditEvent.findFirst({
      where: {
        entityId: fileId,
        eventType: 'DELETED',
      },
    });
    expect(deleteAudit).not.toBeNull();
    expect(deleteAudit!.actor).toBe('admin_operator');

    // Remove from afterAll cleanup list since already deleted
    const index = createdFileIds.indexOf(fileId);
    if (index > -1) createdFileIds.splice(index, 1);
  });
});
