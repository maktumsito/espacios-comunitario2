import React, { useState, useMemo } from 'react';
import { EquipmentItem, ReservationEquipmentRequest, Reservation } from '../types';
import { calculateEquipmentAvailability } from '../services/equipmentService';
import { timeToMinutes } from '../utils/conflictDetector';
import {
  Video,
  Presentation,
  Mic,
  Radio,
  Speaker,
  Laptop,
  Zap,
  Grid,
  Armchair,
  FileText,
  Layers,
  Plug,
  Plus,
  Minus,
  AlertTriangle,
  Package,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface EquipmentSelectorProps {
  date: string;
  startTime: string;
  endTime: string;
  allReservations: readonly Reservation[];
  equipmentList: EquipmentItem[];
  selectedEquipment: ReservationEquipmentRequest[];
  onChange: (items: ReservationEquipmentRequest[]) => void;
  excludeReservationId?: string;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Video,
  Presentation,
  Mic,
  Radio,
  Speaker,
  Laptop,
  Zap,
  Grid,
  Armchair,
  FileText,
  Layers,
  Plug,
  Package
};

export const EquipmentSelector: React.FC<EquipmentSelectorProps> = ({
  date,
  startTime,
  endTime,
  allReservations,
  equipmentList,
  selectedEquipment,
  onChange,
  excludeReservationId,
  disabled = false,
  defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || selectedEquipment.length > 0);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  // Calculate live availability on the fly
  const availability = useMemo(() => {
    return calculateEquipmentAvailability(
      date,
      startMin,
      endMin,
      allReservations,
      equipmentList,
      excludeReservationId
    );
  }, [date, startMin, endMin, allReservations, equipmentList, excludeReservationId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    equipmentList.forEach(e => {
      if (e.category) set.add(e.category);
    });
    return ['Todas', ...Array.from(set)];
  }, [equipmentList]);

  const handleQuantityChange = (item: EquipmentItem, newQuantity: number) => {
    if (disabled) return;
    const clamped = Math.max(0, Math.min(item.totalQuantity, newQuantity));
    const existingIndex = selectedEquipment.findIndex(e => e.equipmentId === item.id);

    let updated: ReservationEquipmentRequest[];
    if (clamped === 0) {
      updated = selectedEquipment.filter(e => e.equipmentId !== item.id);
    } else if (existingIndex >= 0) {
      updated = [...selectedEquipment];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: clamped
      };
    } else {
      updated = [
        ...selectedEquipment,
        {
          equipmentId: item.id,
          equipmentName: item.name,
          quantity: clamped
        }
      ];
    }
    onChange(updated);
  };

  const handleNoteChange = (equipmentId: string, notes: string) => {
    const updated = selectedEquipment.map(e => {
      if (e.equipmentId === equipmentId) {
        return { ...e, notes };
      }
      return e;
    });
    onChange(updated);
  };

  const totalItemsSelected = selectedEquipment.reduce((acc, curr) => acc + curr.quantity, 0);

  if (!isExpanded) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl shadow-xs shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Equipamiento y Mobiliario Compartido</span>
              {totalItemsSelected > 0 ? (
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full font-mono">
                  {totalItemsSelected} {totalItemsSelected === 1 ? 'recurso' : 'recursos'}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-medium">
                  (Opcional)
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {totalItemsSelected > 0
                ? selectedEquipment.map(e => `${e.equipmentName} (${e.quantity})`).join(', ')
                : 'Proyector Data Show, micrófonos, sonido, mesas, sillas o colchonetas'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          aria-expanded={false}
          className="flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 transition-colors shrink-0"
        >
          <span>{totalItemsSelected > 0 ? 'Modificar' : 'Agregar recursos'}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-4 shadow-2xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
              <span>Equipamiento y Recursos Compartidos</span>
              {totalItemsSelected > 0 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full font-mono">
                  {totalItemsSelected} {totalItemsSelected === 1 ? 'ítem solicitado' : 'ítems solicitados'}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500">
              Selecciona los recursos necesarios para la actividad. Se verifica disponibilidad en tiempo real.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          aria-expanded={true}
          className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs shrink-0"
          title="Ocultar selector de equipamiento"
        >
          <span>Ocultar</span>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Equipment Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
        {availability
          .filter(a => selectedCategory === 'Todas' || a.item.category === selectedCategory)
          .map(({ item, totalQuantity, usedQuantity, availableQuantity, isAvailable, occupyingReservations }) => {
            const currentReq = selectedEquipment.find(e => e.equipmentId === item.id);
            const currentQty = currentReq?.quantity || 0;
            const IconComp = (item.iconName && ICON_MAP[item.iconName]) || Package;
            const isOverbooked = currentQty > availableQuantity;
            const isNoteOpen = expandedNotes[item.id] || Boolean(currentReq?.notes);

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition flex flex-col justify-between space-y-2.5 ${
                  currentQty > 0
                    ? isOverbooked
                      ? 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-300'
                      : 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        currentQty > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {item.category}
                        </div>
                      </div>
                    </div>

                    {/* Stock badge */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 font-mono ${
                      availableQuantity === 0
                        ? 'bg-rose-100 text-rose-800'
                        : availableQuantity < totalQuantity
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {availableQuantity}/{totalQuantity} disp.
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-1.5" title={item.description}>
                      {item.description}
                    </p>
                  )}

                  {/* Overbooking or Occupied Warning */}
                  {isOverbooked && (
                    <div className="mt-1.5 p-1.5 bg-rose-100 border border-rose-200 rounded-lg text-[10px] text-rose-800 flex items-start space-x-1">
                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                      <span>
                        ¡Stock insuficiente! Solo hay {availableQuantity} unidades libres en este horario.
                      </span>
                    </div>
                  )}

                  {!isOverbooked && usedQuantity > 0 && availableQuantity > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700">
                      {usedQuantity} en uso por otra actividad en este horario.
                    </div>
                  )}
                </div>

                {/* Bottom Stepper Control */}
                <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      aria-label={`Quitar una unidad de ${item.name}`}
                      onClick={() => handleQuantityChange(item, currentQty - 1)}
                      disabled={disabled || currentQty === 0}
                      className="h-11 w-11 rounded-md bg-white hover:bg-slate-100 disabled:opacity-30 border border-slate-200 text-slate-700 flex items-center justify-center transition-colors text-xs font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    <span className={`w-7 text-center font-bold text-xs font-mono ${
                      currentQty > 0 ? 'text-indigo-900' : 'text-slate-400'
                    }`}>
                      {currentQty}
                    </span>

                    <button
                      type="button"
                      aria-label={`Agregar una unidad de ${item.name}`}
                      onClick={() => handleQuantityChange(item, currentQty + 1)}
                      disabled={disabled || currentQty >= totalQuantity}
                      className="h-11 w-11 rounded-md bg-white hover:bg-slate-100 disabled:opacity-30 border border-slate-200 text-slate-700 flex items-center justify-center transition-colors text-xs font-bold"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {currentQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      {isNoteOpen ? 'Ocultar nota' : '+ Nota'}
                    </button>
                  )}
                </div>

                {/* Optional Note Field */}
                {currentQty > 0 && isNoteOpen && (
                  <input
                    type="text"
                    placeholder="Nota de uso (ej. Cable largo, proyector en piso)"
                    value={currentReq?.notes || ''}
                    onChange={(e) => handleNoteChange(item.id, e.target.value)}
                    className="w-full text-[11px] p-1.5 bg-white border border-indigo-200 rounded-lg text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
