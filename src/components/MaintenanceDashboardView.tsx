import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useMemo } from 'react';
import { SpaceBlock, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import {
  Hammer,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  AlertTriangle,
  Search,
  Wrench,
  Repeat,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Building2
} from 'lucide-react';
import { SpaceBlockModal } from './SpaceBlockModal';

interface MaintenanceDashboardViewProps {
  blocks: SpaceBlock[];
  onSaveBlock: (block: SpaceBlock) => Promise<void>;
  onDeleteBlock: (id: string) => Promise<void>;
  availableSpaces?: SpaceInfo[];
}

export const MaintenanceDashboardView: React.FC<MaintenanceDashboardViewProps> = ({
  blocks,
  onSaveBlock,
  onDeleteBlock,
  availableSpaces
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMotivo, setFilterMotivo] = useState('all');
  const [filterSpace, setFilterSpace] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<SpaceBlock | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<SpaceBlock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isPurgingPast, setIsPurgingPast] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const spacesList = useMemo(() => {
    return availableSpaces && availableSpaces.length > 0 ? availableSpaces : SPACES_LIST;
  }, [availableSpaces]);

  // Filter and sort blocks
  const filteredBlocks = blocks.filter((b) => {
    if (filterMotivo !== 'all' && b.motivo !== filterMotivo) return false;
    if (filterSpace !== 'all' && b.espacio !== filterSpace) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchSpace = b.espacio.toLowerCase().includes(q);
      const matchDesc = b.descripcion.toLowerCase().includes(q);
      const matchResp = (b.responsableMantenimiento || '').toLowerCase().includes(q);
      if (!matchSpace && !matchDesc && !matchResp) return false;
    }
    return true;
  }).sort((a, b) => {
    // Active / ongoing first, then by fechaInicio descending
    const aOngoing = todayStr >= a.fechaInicio && todayStr <= a.fechaFin;
    const bOngoing = todayStr >= b.fechaInicio && todayStr <= b.fechaFin;
    if (aOngoing && !bOngoing) return -1;
    if (!aOngoing && bOngoing) return 1;
    return b.fechaInicio.localeCompare(a.fechaInicio);
  });

  const activeCount = blocks.filter((b) => b.activo && todayStr >= b.fechaInicio && todayStr <= b.fechaFin).length;
  const scheduledCount = blocks.filter((b) => b.activo && b.fechaInicio > todayStr).length;
  const pastBlocks = useMemo(() => blocks.filter((b) => b.fechaFin < todayStr), [blocks, todayStr]);

  const handleOpenNew = () => {
    setEditingBlock(null);
    setIsModalOpen(true);
  };

  const handleEdit = (b: SpaceBlock) => {
    setEditingBlock(b);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!blockToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteBlock(blockToDelete.id);
      setBlockToDelete(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto px-3 sm:px-4 lg:px-6 py-6 space-y-6">
      {/* Top Banner / Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
            <Hammer className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Mantención y Bloqueos de Espacios</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                {blocks.length} registrados
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Administra inhabilitaciones de canchas, salas y recintos por obras, pintura o mantención preventiva
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenNew}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-amber-600/20 transition cursor-pointer flex items-center space-x-2 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nuevo Bloqueo</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">En Curso Hoy</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{activeCount}</p>
          <span className="text-[11px] text-slate-400">Espacios con obras activas hoy</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Programados a Futuro</span>
          <p className="text-2xl font-black text-blue-600 mt-2">{scheduledCount}</p>
          <span className="text-[11px] text-slate-400">Bloqueos futuros calendarizados</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Total Histórico</span>
          <p className="text-2xl font-black text-slate-800 mt-2">{blocks.length}</p>
          <span className="text-[11px] text-slate-400">Total de mantenciones en base de datos</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por espacio, motivo, obra o encargado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Espacio:</span>
            <select
              value={filterSpace}
              onChange={(e) => setFilterSpace(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              <option value="all">Todos los espacios</option>
              {spacesList.map((sp) => (
                <option key={sp.id} value={sp.name}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Motivo:</span>
            <select
              value={filterMotivo}
              onChange={(e) => setFilterMotivo(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              <option value="all">Todos los motivos</option>
              <option value="Mantención">Mantención General</option>
              <option value="Pintura">Pintura</option>
              <option value="Reparaciones">Reparaciones</option>
              <option value="Aseo Profundo">Aseo Profundo</option>
              <option value="Obras">Obras Mayores</option>
              <option value="Evento Institucional">Evento Institucional</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>
      </div>

      {/* Blocks Grid / Table */}
      {filteredBlocks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No hay bloqueos o mantenciones registradas</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Todos los espacios se encuentran completamente operativos y habilitados para reserva normal.
          </p>
          <button
            type="button"
            onClick={handleOpenNew}
            className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            + Registrar primer bloqueo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBlocks.map((block) => {
            const isOngoing = todayStr >= block.fechaInicio && todayStr <= block.fechaFin;
            const isFuture = block.fechaInicio > todayStr;
            const isPast = block.fechaFin < todayStr;

            return (
              <div
                key={block.id}
                className={`bg-white border rounded-2xl p-4.5 shadow-xs transition hover:shadow-md flex flex-col justify-between ${
                  isOngoing
                    ? 'border-amber-400 ring-2 ring-amber-400/20'
                    : isFuture
                    ? 'border-blue-200'
                    : 'border-slate-200 opacity-75'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {block.motivo}
                      </span>
                      <h2 className="font-extrabold text-base text-slate-900 mt-1">
                        {block.espacio}
                      </h2>
                    </div>

                    {isOngoing ? (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                        🚧 En Curso
                      </span>
                    ) : isFuture ? (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
                        📅 Programado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                        Concluido
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-700 font-medium bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 mb-3">
                    {block.descripcion}
                  </p>

                  {/* Details metadata */}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {formatDateDDMMYYYY(block.fechaInicio)}
                        {block.fechaInicio !== block.fechaFin && ` hasta ${formatDateDDMMYYYY(block.fechaFin)}`}
                      </span>
                    </div>

                    {block.fechaFinRecurrencia && (
                      <div className="flex items-center space-x-1.5 text-amber-900 font-bold bg-amber-50 px-2 py-1 rounded-md border border-amber-200 text-[11px]">
                        <Repeat className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Se repite hasta: {formatDateDDMMYYYY(block.fechaFinRecurrencia)}</span>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {block.todoElDia ? 'Jornada completa (Todo el día)' : `${block.horaInicio || '08:00'} a ${block.horaFin || '22:30'}`}
                      </span>
                    </div>

                    {block.responsableMantenimiento && (
                      <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        Encargado: <strong className="text-slate-800">{block.responsableMantenimiento}</strong>
                        {block.contactoEmpresa && ` (${block.contactoEmpresa})`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(block)}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                    title="Editar bloqueo"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockToDelete(block)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="Eliminar bloqueo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsible Safe Maintenance Management & Purge Zone */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setIsDangerZoneOpen(!isDangerZoneOpen)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
        >
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                Gestión Avanzada y Depuración de Bloqueos
              </h4>
              <p className="text-[11px] text-slate-500">
                Limpieza segura de registros históricos y mantenciones concluidas
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500">
              {pastBlocks.length} concluidos
            </span>
            {isDangerZoneOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isDangerZoneOpen && (
          <div className="p-4 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl">
              <div>
                <p className="text-xs font-bold text-slate-800">Depurar bloqueos concluidos anteriores a hoy</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Elimina en lote los registros de mantención pasados para optimizar el historial. Requiere confirmación secundaria explícita.
                </p>
              </div>
              <button
                type="button"
                disabled={pastBlocks.length === 0 || isPurgingPast}
                onClick={() => setShowPurgeModal(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Depurar {pastBlocks.length} Bloqueos Antiguos</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <SpaceBlockModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingBlock(null);
          }}
          onSave={onSaveBlock}
          editingBlock={editingBlock}
          availableSpaces={spacesList}
        />
      )}

      {/* Delete Single Confirmation Dialog */}
      {blockToDelete && (
        <ModalOverlay onClose={() => { if (!isDeleting) setBlockToDelete(null); }} className="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-base text-slate-900">¿Eliminar bloqueo de mantención?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Se rehabilitará de inmediato el espacio <strong>{blockToDelete.espacio}</strong> para permitir nuevas reservas durante este horario.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Purge Secondary Confirmation Dialog */}
      {showPurgeModal && (
        <ModalOverlay onClose={() => { if (!isPurgingPast) setShowPurgeModal(false); }} className="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-rose-200 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900">¿Confirmar depuración de {pastBlocks.length} registros?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Esta acción eliminará de forma irreversible los registros históricos concluidos anteriores a la fecha actual ({formatDateDDMMYYYY(todayStr)}).
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPurgingPast}
                onClick={async () => {
                  setIsPurgingPast(true);
                  try {
                    for (const block of pastBlocks) {
                      await onDeleteBlock(block.id);
                    }
                    setShowPurgeModal(false);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setIsPurgingPast(false);
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                {isPurgingPast ? 'Depurando...' : 'Sí, Depurar Historial'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
};
