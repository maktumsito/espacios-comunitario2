import React, { useState } from 'react';
import { BaseModal } from './common/BaseModal';
import {
  X,
  Download,
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  Image as ImageIcon,
  CheckCircle2
} from 'lucide-react';
import { CommitmentLetterAttachment } from '../types';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: CommitmentLetterAttachment | null;
  title?: string;
  subtitle?: string;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  attachment,
  title = 'Carta de Compromiso Escaneada',
  subtitle
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  if (!isOpen || !attachment) return null;

  const isPdf = attachment.type.includes('pdf') || attachment.name.toLowerCase().endsWith('.pdf');
  const isImage = attachment.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.name);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.dataUrl;
    link.download = attachment.name || 'Carta_Compromiso_Firmada.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (isImage) {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(`
          <html>
            <head>
              <title>${title} - ${attachment.name}</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
                img { max-width: 95%; max-height: 95vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${attachment.dataUrl}" onload="window.print();window.close();" />
            </body>
          </html>
        `);
        printWin.document.close();
      }
    } else {
      // For PDF or other formats
      const printWin = window.open(attachment.dataUrl, '_blank');
      if (printWin) {
        printWin.focus();
      }
    }
  };

  const headerElement = (
    <div className="px-6 py-3.5 bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
      <div className="flex items-center space-x-3 min-w-0">
        <div className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
          {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2 truncate">
            <span className="truncate">{title}</span>
            <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold shrink-0">
              Documento Adjunto
            </span>
          </h2>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400 truncate">
            <span className="font-mono text-slate-300 truncate">{attachment.name}</span>
            <span>•</span>
            <span>{formatFileSize(attachment.size)}</span>
            {attachment.uploadedAt && (
              <>
                <span>•</span>
                <span>Subido el {new Date(attachment.uploadedAt).toLocaleDateString('es-CL')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {/* Viewer Controls for Images */}
        {isImage && (
          <div className="hidden sm:flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 mr-2 space-x-1">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              title="Alejar (Zoom -)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono text-slate-300 px-1 font-bold">{zoom}%</span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              title="Acercar (Zoom +)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRotate}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              title="Rotar 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handlePrint}
          className="min-h-[44px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
          title="Imprimir documento"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Imprimir</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
          title="Descargar copia del documento"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Descargar</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center justify-center"
          aria-label="Cerrar visor de documentos"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      layer="nested"
      customHeader={headerElement}
      containerClassName="bg-slate-900 border border-slate-700 h-[92vh] max-h-[95vh] flex flex-col overflow-hidden"
      bodyClassName="p-0 overflow-hidden flex flex-col flex-1"
      footer={
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Documento firmado y verificado</span>
            </span>
            {attachment.notes && (
              <span className="text-slate-400 text-[11px] truncate max-w-md">
                Nota: {attachment.notes}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition text-xs cursor-pointer"
          >
            Cerrar Visor
          </button>
        </div>
      }
    >
      {/* Viewer Body */}
      <div className="flex-1 bg-slate-950/60 p-2 sm:p-4 overflow-auto flex items-center justify-center relative select-none">
        {isPdf ? (
          <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex flex-col">
            <iframe
              src={`${attachment.dataUrl}#toolbar=1&navpanes=0&scrollbar=1`}
              className="w-full h-full border-0 rounded-2xl bg-white"
              title="Vista previa del documento PDF"
            />
          </div>
        ) : isImage ? (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            <img
              src={attachment.dataUrl}
              alt={attachment.name || 'Carta de compromiso escaneada'}
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.15s ease-out',
                maxHeight: zoom <= 100 ? '100%' : 'none',
                maxWidth: zoom <= 100 ? '100%' : 'none'
              }}
              className="rounded-lg shadow-2xl object-contain"
            />
          </div>
        ) : (
          <div className="text-center p-8 space-y-4 bg-slate-900 rounded-2xl border border-slate-800 text-slate-300">
            <FileText className="w-16 h-16 text-slate-500 mx-auto" />
            <div>
              <p className="text-sm font-bold text-white">Documento adjunto: {attachment.name}</p>
              <p className="text-xs text-slate-400 mt-1">Este tipo de archivo no admite vista previa directa.</p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 mx-auto cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Descargar para ver</span>
            </button>
          </div>
        )}
      </div>
    </BaseModal>
  );
};
