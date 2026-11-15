'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Camera,
  Hash,
  ShieldAlert,
  Search,
} from 'lucide-react';

interface EvidenceViewerProps {
  requestId: string;
  evidenceFiles: any[];
  orderDeliveredAt?: string | null;
  onRefresh: () => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export function EvidenceIntelligenceViewer({
  requestId,
  evidenceFiles = [],
  orderDeliveredAt,
  onRefresh,
  addToast,
}: EvidenceViewerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [analyzingFileId, setAnalyzingFileId] = useState<string | null>(null);
  const [expandedOcr, setExpandedOcr] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleOcrExpand = (fileId: string) => {
    setExpandedOcr((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('file', files[i]);
    }
    formData.append('actor', 'reviewer_operator');

    try {
      const res = await fetch(`/api/refund-requests/${requestId}/evidence`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        addToast?.(data.message || `Uploaded ${files.length} evidence file(s).`, 'success');
        onRefresh();
      } else {
        addToast?.(data.error || 'Failed to upload evidence.', 'error');
      }
    } catch (err: any) {
      addToast?.(err.message, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReanalyze = async (fileId: string, mode: string = 'AUTO') => {
    setAnalyzingFileId(fileId);
    try {
      const res = await fetch(`/api/evidence/${fileId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success) {
        addToast?.('Evidence inspection refreshed successfully.', 'success');
        onRefresh();
      } else {
        addToast?.(data.error || 'Failed to analyze evidence.', 'error');
      }
    } catch (err: any) {
      addToast?.(err.message, 'error');
    } finally {
      setAnalyzingFileId(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to permanently delete this evidence file and its analysis?')) {
      return;
    }
    try {
      const res = await fetch(`/api/evidence/${fileId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        addToast?.('Evidence file removed successfully.', 'success');
        onRefresh();
      } else {
        addToast?.(data.error || 'Could not delete file.', 'error');
      }
    } catch (err: any) {
      addToast?.(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Header and Upload Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Evidence Files & Multimodal Intelligence
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
            {evidenceFiles.length} file{evidenceFiles.length === 1 ? '' : 's'}
          </span>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{isUploading ? 'Inspecting...' : 'Upload Evidence (PNG, JPG, PDF)'}</span>
          </button>
        </div>
      </div>

      {evidenceFiles.length === 0 ? (
        <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-slate-400">
          <ImageIcon className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
          <p className="font-semibold text-xs text-slate-600">No Evidence Files Uploaded</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Upload product photos, damage close-ups, receipts, or shipping labels to run genuine image inspection and document OCR.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {evidenceFiles.map((file) => {
            const isImage = file.fileType === 'IMAGE';
            const imgAnalysis = file.imageAnalysis;
            const docAnalysis = file.documentAnalysis;
            const isCurrentlyAnalyzing = analyzingFileId === file.id;

            return (
              <div
                key={file.id}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3"
              >
                {/* File Header Bar */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {isImage ? (
                      <ImageIcon className="w-4 h-4 text-sky-600" />
                    ) : (
                      <FileText className="w-4 h-4 text-purple-600" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800">{file.fileName}</span>
                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {(file.fileSize / 1024).toFixed(1)} KB
                        </span>
                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {file.mimeType}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        SHA-256: {file.fileHash?.slice(0, 16)}... • Uploaded:{' '}
                        {new Date(file.uploadedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/api/evidence/${file.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors title='Open File'"
                      title="View file"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleReanalyze(file.id, isImage ? 'IMAGE' : 'DOCUMENT')}
                      disabled={isCurrentlyAnalyzing}
                      className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Re-run Intelligence Inspection"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isCurrentlyAnalyzing ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Evidence"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* IMAGE INTELLIGENCE CARD */}
                {imgAnalysis && (
                  <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-sky-700" />
                        <span className="font-bold text-xs text-sky-950">
                          Image Intelligence & Damage Inspection
                        </span>
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
                          {imgAnalysis.provider || 'LOCAL_CV'} ({imgAnalysis.modelOrEngine || 'sharp-cv-v1'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-sky-900">
                          Quality Score: {imgAnalysis.qualityScore ?? 85}/100
                        </span>
                      </div>
                    </div>

                    {/* Metadata & Quality Metrics */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] bg-white p-2.5 rounded-lg border border-sky-100">
                      <div>
                        <span className="text-slate-400 block">Resolution & Format:</span>
                        <span className="font-semibold text-slate-800">
                          {imgAnalysis.width} × {imgAnalysis.height} ({imgAnalysis.format?.toUpperCase()})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Blur Metric:</span>
                        <span
                          className={`font-semibold ${
                            imgAnalysis.isBlurry ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {imgAnalysis.isBlurry ? '⚠ Blurry / Low Contrast' : '✓ Sharp Focus'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Lighting:</span>
                        <span
                          className={`font-semibold ${
                            imgAnalysis.lightingIssue ? 'text-amber-600' : 'text-emerald-700'
                          }`}
                        >
                          {imgAnalysis.lightingIssue ? '⚠ Poor Lighting' : '✓ Good Exposure'}
                        </span>
                      </div>
                    </div>

                    {/* Perceptual Hash & Duplicate Detection */}
                    <div className="flex items-center justify-between text-[10px] px-2 py-1.5 bg-slate-50 rounded border border-slate-200">
                      <div className="flex items-center gap-1.5 font-mono text-slate-600">
                        <Hash className="w-3 h-3 text-slate-400" />
                        <span>dHash: {file.perceptualHash || 'Computed'}</span>
                      </div>
                      {imgAnalysis.duplicateFound ? (
                        <span className="flex items-center gap-1 text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Duplicate Detected</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">✓ Unique Image</span>
                      )}
                    </div>

                    {/* Duplicate Alert Details */}
                    {imgAnalysis.duplicateFound && imgAnalysis.duplicateDetails && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 flex items-start gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
                        <span>{imgAnalysis.duplicateDetails}</span>
                      </div>
                    )}

                    {/* EXIF Metadata & Timeline Anomaly */}
                    {(imgAnalysis.exifDeviceModel ||
                      imgAnalysis.exifTimestamp ||
                      imgAnalysis.exifSoftware) && (
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[10px] space-y-1">
                        <div className="flex items-center justify-between text-slate-600 font-mono">
                          <span>
                            Device: {imgAnalysis.exifDeviceModel || 'Generic / Stripped'}
                          </span>
                          {imgAnalysis.exifTimestamp && (
                            <span>
                              Captured: {new Date(imgAnalysis.exifTimestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {imgAnalysis.exifSoftware && (
                          <div className="text-slate-500 font-mono">
                            Software/Editor: {imgAnalysis.exifSoftware} (Tamper Score:{' '}
                            {imgAnalysis.tamperScore || 0})
                          </div>
                        )}
                      </div>
                    )}

                    {/* Damage & Packaging Assessment */}
                    <div className="p-2.5 bg-white rounded-lg border border-sky-100 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          Damage Detected:{' '}
                          <span
                            className={
                              imgAnalysis.damageDetected ? 'text-amber-700 font-bold' : 'text-slate-600'
                            }
                          >
                            {imgAnalysis.damageDetected
                              ? `${imgAnalysis.damageType || 'DAMAGE'} (${imgAnalysis.damageSeverity} Severity)`
                              : 'None detected'}
                          </span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          Packaging: {imgAnalysis.packagingCondition?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[10px]">
                        {imgAnalysis.analysisSummary}
                      </p>

                      {/* Forensic Findings list */}
                      {(() => {
                        let findings: string[] = [];
                        try {
                          findings = JSON.parse(imgAnalysis.findings || '[]');
                        } catch {}
                        if (findings.length === 0) return null;
                        return (
                          <ul className="list-disc pl-4 space-y-0.5 pt-1 text-[10px] text-slate-600">
                            {findings.map((f, idx) => (
                              <li key={idx}>{f}</li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* DOCUMENT INTELLIGENCE & OCR CARD */}
                {docAnalysis && (
                  <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-purple-700" />
                        <span className="font-bold text-xs text-purple-950">
                          Document OCR & Verification
                        </span>
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                          {docAnalysis.provider || 'PDF_PARSE'}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-200 text-purple-900">
                          {docAnalysis.documentType}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-purple-900">
                        Confidence: {((docAnalysis.confidenceScore || 0) * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Order Cross-Verification Match Status Banner */}
                    <div
                      className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        docAnalysis.orderMatchStatus === 'MATCHED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : docAnalysis.orderMatchStatus === 'CONTRADICTORY'
                          ? 'bg-rose-50 border-rose-300 text-rose-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {docAnalysis.orderMatchStatus === 'MATCHED' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        ) : docAnalysis.orderMatchStatus === 'CONTRADICTORY' ? (
                          <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                        <div>
                          <span className="font-bold text-xs">
                            Cross-Check Result: {docAnalysis.orderMatchStatus}
                          </span>
                          <p className="text-[10px] opacity-90">
                            {docAnalysis.orderMatchStatus === 'MATCHED'
                              ? 'Extracted entities match registered store order and product records.'
                              : docAnalysis.orderMatchStatus === 'CONTRADICTORY'
                              ? 'CRITICAL: Extracted document data contradicts store order records!'
                              : 'Discrepancies identified during document cross-check.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Extracted Key-Value Fields Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-purple-100 text-[10px]">
                      <div>
                        <span className="text-slate-400 block">Extracted Order ID:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {docAnalysis.extractedOrderId || 'Not found'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Extracted Amount:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {docAnalysis.extractedAmount != null
                            ? `$${Number(docAnalysis.extractedAmount).toFixed(2)}`
                            : 'Not found'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Invoice Number:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {docAnalysis.extractedInvoiceNo || 'Not found'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Extracted SKU:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {docAnalysis.extractedSku || 'Not found'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Carrier / Tracking:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {docAnalysis.extractedCarrier || 'N/A'}{' '}
                          {docAnalysis.extractedTracking ? `(${docAnalysis.extractedTracking})` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Document Date:</span>
                        <span className="font-semibold text-slate-800">
                          {docAnalysis.extractedDate
                            ? new Date(docAnalysis.extractedDate).toLocaleDateString()
                            : 'Not found'}
                        </span>
                      </div>
                    </div>

                    {/* Inconsistencies List */}
                    {(() => {
                      let inconsistencies: string[] = [];
                      try {
                        inconsistencies = JSON.parse(docAnalysis.inconsistencies || '[]');
                      } catch {}
                      if (inconsistencies.length === 0) return null;
                      return (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[10px] space-y-1">
                          <span className="font-bold text-rose-800 uppercase text-[9px] block">
                            Document Cross-Verification Inconsistencies:
                          </span>
                          <ul className="list-disc pl-4 space-y-0.5 text-rose-700">
                            {inconsistencies.map((inc, i) => (
                              <li key={i}>{inc}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* Raw OCR Text Expandable Toggle */}
                    <div className="pt-1">
                      <button
                        onClick={() => toggleOcrExpand(file.id)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-purple-700 hover:text-purple-900"
                      >
                        {expandedOcr[file.id] ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        <span>
                          {expandedOcr[file.id] ? 'Hide Raw OCR Text' : 'View Raw Extracted OCR Text'}
                        </span>
                      </button>

                      {expandedOcr[file.id] && (
                        <pre className="mt-1.5 p-2 bg-slate-900 text-slate-100 rounded-lg text-[9px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {docAnalysis.ocrText || '(No text extracted)'}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
