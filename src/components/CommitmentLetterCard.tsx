import React, { useState, useRef } from 'react';
import {
  FileSignature,
  FileText,
  Download,
  Upload,
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  RefreshCw,
  FileCheck,
  Image as ImageIcon
} from 'lucide-react';
import { Reservation, CommitmentLetterAttachment } from '../types';
import { downloadCommitmentLetterPdf, CommitmentScheduleSlot } from '../utils/commitmentLetterPdf';
import { compressImageToDataUrl, readFileToDataUrl, formatBytes } from '../utils/fileUtils';
import { DocumentViewerModal } from './DocumentViewerModal';
import { CommitmentLetterModal } from './CommitmentLetterModal';
import { ConfirmationModal } from './common/ConfirmationModal';

interface CommitmentLetterCardProps {
  reservation: Reservation | Partial<Reservation>;
  allReservations?: Reservation[];
  seriesScheduleItems?: CommitmentScheduleSlot[];
  onUpdateAttachment?: (attachment: CommitmentLetterAttachment | null) => void;
  readOnly?: boolean;
}

export const CommitmentLetterCard: React.FC<CommitmentLetterCardProps> = ({
  reservation,
  allReservations,
  seriesScheduleItems,
  onUpdateAttachment,
  readOnly = false
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDocViewer, setShowDocViewer] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachment = reservation.cartaCompromisoAdjunta || null;
  const isPdf = attachment?.type?.includes('pdf') || attachment?.name?.toLowerCase().endsWith('.pdf');

  // Handle instant download of official blank/prefilled PDF
  const handleDownloadOfficialPdf = async () => {
    if (isDownloading) return;
    try {
      setUploadError(null);
      setIsDownloading(true);
      await downloadCommitmentLetterPdf(reservation, {
        allReservations,
        seriesScheduleItems
      });
    } catch (err) {
      console.error('Error downloading commitment letter:', err);
      setUploadError('Hubo un error al generar la carta de compromiso.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle file processing (scanned PDF or photo)
  const processSelectedFile = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);

    try {
      // Check maximum file size (limit to ~4MB raw file)
      if (file.size > 4.5 * 1024 * 1024) {
        throw new Error('El archivo seleccionado es demasiado grande. El límite recomendado es de 4 MB.');
      }

      let dataUrl: string;
      const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

      if (isImg) {
        // Compress image to keep Firestore and IndexedDB lightweight and fast
        dataUrl = await compressImageToDataUrl(file, 1280, 1280, 0.80);
      } else {
        // PDF or other documents
        dataUrl = await readFileToDataUrl(file);
      }

      const newAttachment: CommitmentLetterAttachment = {
        name: file.name,
        type: file.type || (isImg ? 'image/jpeg' : 'application/pdf'),
        size: Math.round((dataUrl.length * 3) / 4), // Approximate bytes from base64
        dataUrl,
        uploadedAt: new Date().toISOString()
      };

      if (onUpdateAttachment) {
        onUpdateAttachment(newAttachment);
      }
    } catch (err: any) {
      console.error('Error uploading scanned letter:', err);
      setUploadError(err?.message || 'Error al procesar el archivo escaneado.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDeleteAttachment = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteAttachment = () => {
    if (onUpdateAttachment) {
      onUpdateAttachment(null);
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Main Card */}
      <div
        className={`p-4 rounded-2xl border transition-all duration-200 ${
          attachment
            ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/30'
            : isDragOver
            ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/50'
            : 'bg-slate-50 border-slate-200'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
          <div className="flex items-center space-x-2">
            <div
              className={`p-1.5 rounded-lg ${
                attachment
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              <FileSignature className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                <span>Carta de Compromiso Oficial</span>
              </h4>
              <p className="text-[10px] text-slate-500">
                Reglamento y condiciones de uso firmadas por el solicitante
              </p>
            </div>
          </div>

          {/* Status Badge */}
          {attachment ? (
            <span className="flex items-center space-x-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Carta Firmada y Adjunta</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
              <Clock className="w-3 h-3 text-amber-700" />
              <span>Pendiente de Firma / Escaneo</span>
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="pt-3 space-y-3">
          {/* IF ATTACHMENT EXISTS */}
          {attachment ? (
            <div className="space-y-3">
              {/* File Info Box */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700 border border-emerald-100 shrink-0">
                    {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate" title={attachment.name}>
                      {attachment.name}
                    </p>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-medium">
                      <span>{formatBytes(attachment.size)}</span>
                      <span>•</span>
                      <span>Subido: {new Date(attachment.uploadedAt).toLocaleDateString('es-CL')}</span>
                    </div>
                  </div>
                </div>

                {/* Primary Consult / View Button */}
                <button
                  id="btn-consultar-carta-adjunta"
                  type="button"
                  onClick={() => setShowDocViewer(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5 shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Consultar Carta</span>
                </button>
              </div>

              {/* Action Buttons for Attached Document */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = attachment.dataUrl;
                      link.download = attachment.name || 'Carta_Compromiso_Firmada.pdf';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                    title="Descargar copia del archivo escaneado"
                  >
                    <Download className="w-3 h-3 text-slate-500" />
                    <span>Descargar archivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLetterModal(true)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                    title="Ver texto de la carta oficial"
                  >
                    <FileCheck className="w-3 h-3 text-slate-500" />
                    <span>Ver Texto Oficial</span>
                  </button>
                </div>

                {!readOnly && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                      title="Reemplazar archivo escaneado por una nueva versión"
                    >
                      <RefreshCw className={`w-3 h-3 text-slate-500 ${isUploading ? 'animate-spin' : ''}`} />
                      <span>Reemplazar</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAttachment}
                      className="min-h-[44px] min-w-[44px] p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition cursor-pointer flex items-center justify-center"
                      title="Eliminar carta escaneada"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* IF NO ATTACHMENT YET */
            <div className="space-y-3">
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-3 bg-amber-500/10 rounded-xl border border-amber-300">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-950">
                    1. Descargar o Imprimir Carta para el Solicitante
                  </p>
                  <p className="text-[11px] text-amber-900/80">
                    Genera el PDF oficial prellenado con los datos de esta reserva para que el solicitante lo firme.
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadOfficialPdf}
                    disabled={isDownloading}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black rounded-xl text-xs transition shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-950" />
                    <span>{isDownloading ? 'Generando...' : 'Descargar PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLetterModal(true)}
                    className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    title="Previsualizar e imprimir directamente"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-800" />
                    <span className="hidden sm:inline">Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Upload Dropzone */}
              {!readOnly && (
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`p-3.5 rounded-xl border-2 border-dashed transition cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 ${
                    isDragOver
                      ? 'border-amber-500 bg-amber-100/60'
                      : 'border-slate-300 hover:border-amber-400 bg-white hover:bg-amber-50/30'
                  }`}
                >
                  <div className="p-2 bg-amber-100 text-amber-900 rounded-full">
                    <Upload className={`w-4 h-4 ${isUploading ? 'animate-bounce' : ''}`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      2. Subir Carta Firmada y Escaneada
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Arrastra aquí el archivo (PDF, JPG o PNG) o haz clic para seleccionarlo
                    </p>
                  </div>
                  {isUploading && (
                    <p className="text-[10px] font-bold text-amber-700 animate-pulse">
                      Procesando y guardando documento...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload error message */}
          {uploadError && (
            <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Scanned Document Viewer Modal */}
      {showDocViewer && attachment && (
        <DocumentViewerModal
          isOpen={showDocViewer}
          onClose={() => setShowDocViewer(false)}
          attachment={attachment}
          title={`Carta de Compromiso — ${(reservation.espacio || 'Espacio').toUpperCase()}`}
        />
      )}

      {/* Official Commitment Letter Generator & Text Modal */}
      {showLetterModal && (
        <CommitmentLetterModal
          isOpen={showLetterModal}
          onClose={() => setShowLetterModal(false)}
          reservationData={reservation}
          allReservations={allReservations}
          seriesScheduleItems={seriesScheduleItems}
        />
      )}

      {/* Confirmation Modal for deleting attachment */}
      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="¿Eliminar Carta de Compromiso?"
          message="¿Estás seguro de que deseas eliminar la carta de compromiso escaneada de esta reserva?"
          variant="danger"
          confirmLabel="Eliminar Carta"
          onConfirm={handleConfirmDeleteAttachment}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};
