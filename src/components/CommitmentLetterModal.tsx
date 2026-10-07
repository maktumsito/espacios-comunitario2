import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Reservation, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import {
  extractScheduleSlots,
  computeCommitmentDateRangeAndDays,
  computeCommitmentPoint2Details,
  CommitmentScheduleSlot,
  downloadCommitmentLetterPdf
} from '../utils/commitmentLetterPdf';
import {
  X,
  Printer,
  Download,
  Copy,
  CheckCircle2,
  FileCheck2,
  Edit3,
  Save,
  Layers,
  Calendar,
  FileText,
  AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CommitmentLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservationData: Partial<Reservation>;
  onUpdateReservationData?: (updated: Partial<Reservation>) => void;
  spaces?: SpaceInfo[];
  allReservations?: Reservation[];
  seriesScheduleItems?: CommitmentScheduleSlot[];
}

export const CommitmentLetterModal: React.FC<CommitmentLetterModalProps> = ({
  isOpen,
  onClose,
  reservationData,
  onUpdateReservationData,
  spaces = SPACES_LIST,
  allReservations = [],
  seriesScheduleItems
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Local editable fields including municipal completion antecedents
  const [localData, setLocalData] = useState({
    responsable: (reservationData.responsable || '').toUpperCase(),
    rut: (reservationData.rut || '').toUpperCase(),
    telefonoContacto: (reservationData.telefonoContacto || '').toUpperCase(),
    emailContacto: (reservationData.emailContacto || '').toUpperCase(),
    domicilio: (reservationData.domicilio || '').toUpperCase(),
    espacio: (reservationData.espacio || 'SALA 3').toUpperCase(),
    fecha: reservationData.fecha || format(new Date(), 'yyyy-MM-dd'),
    horaInicio: reservationData.horaInicio || '14:00',
    horaFin: reservationData.horaFin || '22:00',
    tipoActividad: (reservationData.tipoActividad || 'USO DE ESPACIO AUTORIZADO').toUpperCase(),
    tipoPrestamo: (reservationData.tipoPrestamo || 'PRÉSTAMO DE ESPACIO').toUpperCase(),
    descripcion: (reservationData.descripcion || '').toUpperCase(),
    cantidadParticipantes: reservationData.cantidadParticipantes || 15,
    comentarios: (reservationData.comentarios || '').toUpperCase(),
    actoAutorizaUso: (reservationData.actoAutorizaUso || '').toUpperCase(),
    normativaUsoAplicable: (reservationData.normativaUsoAplicable || '').toUpperCase(),
    fundamentoGratuidad: (reservationData.fundamentoGratuidad || '').toUpperCase(),
    delegacionFacultades: (reservationData.delegacionFacultades || '').toUpperCase()
  });

  // Extract all relevant schedule slots (handles multi-day / differentiated spaces)
  const scheduleSlots = useMemo(() => {
    return extractScheduleSlots(
      { ...reservationData, ...localData },
      { seriesScheduleItems, allReservations }
    );
  }, [reservationData, localData, seriesScheduleItems, allReservations]);

  const rangeInfo = useMemo(() => {
    return computeCommitmentDateRangeAndDays(scheduleSlots, { ...reservationData, ...localData });
  }, [scheduleSlots, reservationData, localData]);

  const isMultiSlot = rangeInfo.isMultiSlot;

  const point2Details = useMemo(() => {
    return computeCommitmentPoint2Details({ ...reservationData, ...localData }, rangeInfo);
  }, [reservationData, localData, rangeInfo]);

  // Keep in sync when modal opens or reservationData changes
  React.useEffect(() => {
    if (isOpen) {
      const derivedSlots = extractScheduleSlots(reservationData, { seriesScheduleItems, allReservations });
      const derivedRange = computeCommitmentDateRangeAndDays(derivedSlots, reservationData);
      const initialEspacio = (derivedRange.uniqueSpacesText || reservationData.espacio || 'SALA 3').toUpperCase();

      setLocalData({
        responsable: (reservationData.responsable || '').toUpperCase(),
        rut: (reservationData.rut || '').toUpperCase(),
        telefonoContacto: (reservationData.telefonoContacto || '').toUpperCase(),
        emailContacto: (reservationData.emailContacto || '').toUpperCase(),
        domicilio: (reservationData.domicilio || '').toUpperCase(),
        espacio: initialEspacio,
        fecha: reservationData.fecha || format(new Date(), 'yyyy-MM-dd'),
        horaInicio: reservationData.horaInicio || '14:00',
        horaFin: reservationData.horaFin || '22:00',
        tipoActividad: (reservationData.tipoActividad || 'USO DE ESPACIO AUTORIZADO').toUpperCase(),
        tipoPrestamo: (reservationData.tipoPrestamo || 'PRÉSTAMO DE ESPACIO').toUpperCase(),
        descripcion: (reservationData.descripcion || '').toUpperCase(),
        cantidadParticipantes: reservationData.cantidadParticipantes || 15,
        comentarios: (reservationData.comentarios || '').toUpperCase(),
        actoAutorizaUso: (reservationData.actoAutorizaUso || '').toUpperCase(),
        normativaUsoAplicable: (reservationData.normativaUsoAplicable || '').toUpperCase(),
        fundamentoGratuidad: (reservationData.fundamentoGratuidad || '').toUpperCase(),
        delegacionFacultades: (reservationData.delegacionFacultades || '').toUpperCase()
      });
    }
  }, [isOpen, reservationData, seriesScheduleItems, allReservations]);

  const handleSaveLocalChanges = () => {
    if (onUpdateReservationData) {
      onUpdateReservationData({
        ...reservationData,
        ...localData,
        responsable: localData.responsable.toUpperCase(),
        rut: localData.rut.toUpperCase(),
        telefonoContacto: localData.telefonoContacto.toUpperCase(),
        emailContacto: localData.emailContacto.toUpperCase(),
        domicilio: localData.domicilio.toUpperCase(),
        espacio: localData.espacio.toUpperCase(),
        tipoActividad: localData.tipoActividad.toUpperCase(),
        tipoPrestamo: localData.tipoPrestamo.toUpperCase(),
        descripcion: localData.descripcion.toUpperCase(),
        comentarios: localData.comentarios.toUpperCase(),
        actoAutorizaUso: localData.actoAutorizaUso.toUpperCase(),
        normativaUsoAplicable: localData.normativaUsoAplicable.toUpperCase(),
        fundamentoGratuidad: localData.fundamentoGratuidad.toUpperCase(),
        delegacionFacultades: localData.delegacionFacultades.toUpperCase()
      });
    }
    setIsEditing(false);
  };

  const todayFormattedLong = useMemo(() => {
    return format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  }, []);

  const folioNumber = useMemo(() => {
    const rawId = reservationData.id || 'NUEVO';
    const clean = rawId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    return `CC-${format(new Date(), 'yyyy')}-${clean || '001'}`;
  }, [reservationData.id]);

  if (!isOpen) return null;

  // Print function using formatted window.print
  const handlePrint = () => {
    window.print();
  };

  // Generate and Download PDF using jsPDF matching the user's letter
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    try {
      setPdfError(null);
      setIsGeneratingPdf(true);
      const isConfirmed = Boolean(reservationData.id && reservationData.estado === 'activa');
      await downloadCommitmentLetterPdf(
        { ...reservationData, ...localData },
        { seriesScheduleItems: scheduleSlots, allReservations, isDraft: !isConfirmed }
      );
    } catch (err) {
      console.error('Error generating PDF:', err);
      setPdfError('Hubo un problema al generar el archivo PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const formattedFechaConDia = rangeInfo.formattedDateWithDay;
  const horaInicioStr = localData.horaInicio || '14:00';
  const horaFinStr = localData.horaFin || '22:00';

  // Copy plain text formatted letter matching the official attached template
  const handleCopyText = () => {
    const resp = (localData.responsable || '').trim().toUpperCase();
    const rutStr = (localData.rut || '').trim().toUpperCase();
    const tel = (localData.telefonoContacto || '').trim().toUpperCase();
    const emailStr = (localData.emailContacto || '').trim().toUpperCase();
    const dom = (localData.domicilio || '').trim().toUpperCase();
    const tipoAct = (localData.tipoActividad || 'PRÉSTAMO DE ESPACIO').trim().toUpperCase();

    const fechaDiaStr = point2Details.fechaDiaStr;
    const horarioStr = point2Details.horarioStr;
    const esp = point2Details.espacioStr;
    const modalidadStr = point2Details.modalidadStr;
    const aforoStr = point2Details.aforoStr;
    const propositoStr = point2Details.propositoStr;

    const text = `CARTA DE COMPROMISO Y CONDICIONES DE USO DE ESPACIOS

1. IDENTIFICACIÓN DEL SOLICITANTE / TITULAR RESPONSABLE
Nombre Completo: ${resp || '__________________________________________'} | Cédula / R.U.T.: ${rutStr || '______________________'}
Teléfono Contacto: ${tel || '__________________________________________'} | Correo Electrónico: ${emailStr || '______________________'}
Domicilio / Dirección: ${dom || '__________________________________________'} | Tipo de Actividad: ${tipoAct || '______________________'}

2. DETALLES DEL ESPACIO Y HORARIO AUTORIZADO
Fecha y Día: ${fechaDiaStr || '__________________________________________'} | Horario Autorizado: ${horarioStr || '______________________'}
Espacio Asignado: ${esp || '__________________________________________'} | Modalidad / Tipo: ${modalidadStr || '______________________'}
Aforo Estimado: ${aforoStr || '__________________________________________'} | Propósito / Evento: ${propositoStr || '______________________'}

3. MARCO LEGAL, COMPROMISOS DE COMPORTAMIENTO Y CONDICIONES DE USO

1. NATURALEZA JURÍDICA Y AUTORIZACIÓN PRECARIA DE USO:
Este documento no es un arriendo ni un préstamo pagado: es una autorización precaria para usar un espacio municipal por un tiempo determinado (comodato precario, Arts. 2174, 2194 y 2195 Código Civil; Arts. 5° letra c) y 36 Ley N° 18.695). "Comodato" es un préstamo gratuito que se devuelve en las mismas condiciones; "precario" significa que se otorga por mera tolerancia, sin plazo garantizado, y puede terminarse antes si la Municipalidad lo decide.

2. GRATUIDAD ABSOLUTA Y PROHIBICIÓN DE LUCRO:
El uso del espacio es completamente gratuito (Art. 2174 inc. 1° Código Civil; Arts. 41 y 42 D.L. N° 3.063; Art. 36 Ley N° 18.695). Queda prohibido cobrar entradas, aportes u otro pago, o vender productos dentro del recinto sin autorización expresa del municipio.

3. TRATO DIGNO Y RESPETO IRRESTRICTO A FUNCIONARIOS, VECINOS Y OTROS USUARIOS:
El solicitante y sus invitados deben tratar con respeto a otros vecinos o usuarios del Centro Comunitario, a los funcionarios municipales, coordinadores, personal de aseo y personal de seguridad. Insultar, amenazar o agredir a un funcionario en ejercicio de sus funciones puede constituir delito (Arts. 261, 262, 264 y 296 Código Penal), en el marco de prevención institucional de la Ley N° 21.643 (Ley Karin). Una falta grave permite suspender la actividad, pedir auxilio de la fuerza pública, desalojar e inhabilitar al solicitante.

4. CONDUCTO REGULAR Y CANALIZACIÓN EXCLUSIVA ANTE LA JEFATURA:
Cualquier problema, reclamo o desperfecto debe informarse de manera formal EXCLUSIVAMENTE a la jefatura o administración del Centro Comunitario, y no discutirse con el personal de turno (Arts. 3°, 7° y 24 Ley N° 19.880; Arts. 52 y 53 Ley N° 18.575).

5. MANTENER EL ESPACIO LIMPIO Y EN BUEN ESTADO:
El solicitante debe mantener el espacio limpio y en buen estado durante toda la actividad, y devolverlo tal como lo recibió (Arts. 2178, 2179 y 2180 Código Civil).

6. PUNTUALIDAD RIGUROSA Y HORARIO CONCEDIDO:
El horario autorizado debe respetarse estrictamente, inicio y término (Arts. 1545 y 2180 N° 1 Código Civil; Art. 5° letra c) Ley N° 18.695; Ordenanza Comunal). Como el Centro Comunitario recibe muchas actividades en paralelo, si la actividad se extiende o corre riesgo de exceder el tiempo autorizado, el solicitante debe avisar de inmediato a la administración. No está permitido exigir directamente a la persona o grupo que esté usando la sala que la desocupe: cualquier situación de este tipo debe informarse a la administración, quien coordinará la solución.

7. PROHIBICIÓN TOTAL DE ALCOHOL, TABACO Y SUSTANCIAS:
No se permite portar, vender ni consumir alcohol (Arts. 25 y 26 Ley N° 19.925), ni fumar o usar cigarrillos electrónicos en espacios interiores o patios (Arts. 10 y 11 Leyes N° 20.660 y 21.575). Tampoco se permite portar ni consumir sustancias estupefacientes o psicotrópicas, sancionado como falta (Art. 50 Ley N° 20.000), sin perjuicio de responsabilidades penales mayores si la conducta excede el simple consumo personal.

8. CONVIVENCIA, RUIDO MODERADO Y ORDEN PÚBLICO:
Debe mantenerse un volumen moderado, sin molestar a los vecinos ni a otras actividades del Centro Comunitario (D.S. N° 38/2011 MMA; Arts. 495 N° 1 y 496 N° 1 y 5 Código Penal; Art. 4° letra h) Ley N° 18.695).

9. ASEO, HIGIENE Y RETIRO DE RESIDUOS:
Al finalizar, el solicitante debe retirar toda la basura, dejando el recinto limpio y las bolsas en los contenedores habilitados (Arts. 78, 79 y 80 Código Sanitario DFL N° 725; Art. 494 N° 3 Código Penal; Ordenanza Municipal).

10. FACULTAD DE SUSPENSIÓN INMEDIATA Y DESALOJO POR INCUMPLIMIENTO DEL SOLICITANTE:
Por ser un comodato precario, la administración y la autoridad municipal pueden suspender, revocar o dejar sin efecto de inmediato la autorización, y disponer el desalojo con auxilio de la fuerza pública, ante falta de respeto, incumplimiento o desórdenes graves (Arts. 2194 y 2195 Código Civil; Arts. 5°, 36 y 63 letras f) e i) Ley N° 18.695; Art. 61 Ley N° 19.880). No procede indemnización ni reclamo, y el solicitante puede quedar inhabilitado.

11. FACULTAD DE LA MUNICIPALIDAD PARA REPROGRAMAR O CANCELAR EL PRÉSTAMO POR NECESIDAD SUPERIOR:
Por ser una autorización gratuita y precaria, la Municipalidad puede disponer del espacio ante una necesidad superior o institucional (emergencia, actividad municipal prioritaria, reparación o contingencia de infraestructura), conforme a los Arts. 2194 y 2195 Código Civil, Arts. 5° letra c) y 36 Ley N° 18.695, y Art. 61 Ley N° 19.880 (revocación por mérito, oportunidad o conveniencia). Podrá modificar el horario, reprogramar o cancelar el préstamo, avisando al solicitante con la debida anticipación —salvo caso fortuito o fuerza mayor— y, de ser posible, ofreciendo una alternativa. No genera derecho a indemnización.

Declaro bajo fe de juramento haber leído, comprendido y aceptado en su totalidad las condiciones precedentes, reconociendo el carácter gratuito de la facilitación, su naturaleza no contractual y la plena facultad legal de suspensión inmediata e inhabilitación ante cualquier incumplimiento normativo.

__________________________________________________________________________________________
FIRMA DEL SOLICITANTE                        ADMINISTRACIÓN CENTRO COMUNITARIO DIAGUITAS
Nombre: ${resp || '____________________________________'}
RUT: ${rutStr || '____________________________________'}
`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-slate-100 rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-300 overflow-hidden my-4 flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:border-none print:rounded-none print:m-0 print:bg-white">
        
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 border border-blue-400/30 rounded-xl">
              <FileCheck2 className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center space-x-2">
                <span>Carta de Compromiso y Condiciones de Uso</span>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold border ${
                  Boolean(reservationData.id && reservationData.estado === 'activa')
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`}>
                  {Boolean(reservationData.id && reservationData.estado === 'activa') ? 'Versión Oficial' : 'Borrador / Previsualización'}
                </span>
                {isMultiSlot && (
                  <span className="text-[10px] uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                    <Layers className="w-3 h-3" />
                    <span>{scheduleSlots.length} Sesiones</span>
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Centro Comunitario Diaguitas · Dirección de Desarrollo Comunitario
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Formato: 8.5" × 13" (Oficio)</span>
            </span>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                isEditing
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Vista Previa' : 'Editar Datos'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Buttons Toolbar (Hidden in Print) */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden text-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <span className="font-semibold text-slate-700">Folio:</span>
            <span className="font-mono bg-slate-50 px-2 py-0.5 rounded-md border border-slate-300 font-bold text-slate-900">
              {folioNumber}
            </span>
            <span className="text-slate-400">|</span>
            <span>Fecha: {todayFormattedLong}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Carta</span>
            </button>
          </div>
        </div>

        {/* PDF Error Notification */}
        {pdfError && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between print:hidden">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{pdfError}</span>
            </div>
            <button
              onClick={() => setPdfError(null)}
              className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Edit Form if enabled */}
        {isEditing && (
          <div className="p-6 bg-amber-50/60 border-b border-amber-200 space-y-4 max-h-[45vh] overflow-y-auto text-xs print:hidden">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 flex items-center space-x-1.5">
                <Edit3 className="w-4 h-4 text-amber-700" />
                <span>Editar Datos de Identificación y Reserva</span>
              </span>
              <button
                onClick={handleSaveLocalChanges}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg transition flex items-center space-x-1 shadow-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar y Aplicar</span>
              </button>
            </div>

            {/* Identificación y Reserva */}
            <div className="space-y-2">
              <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                Identificación y Reserva:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Solicitante Responsable:</label>
                  <input
                    type="text"
                    value={localData.responsable}
                    onChange={(e) => setLocalData({ ...localData, responsable: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">RUT Solicitante:</label>
                  <input
                    type="text"
                    placeholder="12.345.678-9"
                    value={localData.rut}
                    onChange={(e) => setLocalData({ ...localData, rut: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Teléfono:</label>
                  <input
                    type="text"
                    placeholder="988879580"
                    value={localData.telefonoContacto}
                    onChange={(e) => setLocalData({ ...localData, telefonoContacto: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Correo Electrónico:</label>
                  <input
                    type="email"
                    value={localData.emailContacto}
                    onChange={(e) => setLocalData({ ...localData, emailContacto: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-slate-700">Domicilio:</label>
                  <input
                    type="text"
                    placeholder="Dirección, calle y número"
                    value={localData.domicilio}
                    onChange={(e) => setLocalData({ ...localData, domicilio: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Tipo de Actividad:</label>
                  <input
                    type="text"
                    value={localData.tipoActividad}
                    onChange={(e) => setLocalData({ ...localData, tipoActividad: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Espacio Asignado:</label>
                  <input
                    type="text"
                    value={localData.espacio}
                    onChange={(e) => setLocalData({ ...localData, espacio: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Modalidad / Tipo:</label>
                  <input
                    type="text"
                    placeholder="Puntual / Regular"
                    value={localData.tipoPrestamo}
                    onChange={(e) => setLocalData({ ...localData, tipoPrestamo: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Aforo Estimado:</label>
                  <input
                    type="number"
                    value={localData.cantidadParticipantes}
                    onChange={(e) => setLocalData({ ...localData, cantidadParticipantes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Fecha del Préstamo:</label>
                  <input
                    type="date"
                    value={localData.fecha}
                    onChange={(e) => setLocalData({ ...localData, fecha: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Horario Inicio:</label>
                  <input
                    type="time"
                    value={localData.horaInicio}
                    onChange={(e) => setLocalData({ ...localData, horaInicio: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Horario Fin:</label>
                  <input
                    type="time"
                    value={localData.horaFin}
                    onChange={(e) => setLocalData({ ...localData, horaFin: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <label className="font-semibold text-slate-700">Propósito / Evento:</label>
                  <input
                    type="text"
                    placeholder="Descripción o propósito de la actividad"
                    value={localData.descripcion}
                    onChange={(e) => setLocalData({ ...localData, descripcion: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Printable Document Preview Area - Exactly replicating the User's Attached Template */}
        <div
          ref={printContentRef}
          className="overflow-y-auto flex-1 p-4 sm:p-8 space-y-6 print:p-0 print:overflow-visible"
        >
          {/* Print media query forcing 8.5 x 13 inches (Oficio) */}
          <style>{`
            @media print {
              @page {
                size: 8.5in 13in !important;
                margin: 8mm 10mm !important;
              }
            }
          `}</style>

          {/* ============================================================== */}
          {/* SHEET / PAGE 1 (TAMAÑO OFICIO: 8.5" x 13" / 215.9 x 330.2 mm) */}
          {/* ============================================================== */}
          <div className="bg-white p-6 sm:p-9 rounded-2xl shadow-sm border border-slate-200 text-slate-900 space-y-2.5 text-xs leading-relaxed max-w-[215.9mm] mx-auto print:border-none print:shadow-none print:p-0 print:rounded-none print:m-0">
            
            {/* Main Centered Document Title */}
            <div className="text-center pt-1 pb-0.5">
              <h1 className="font-serif text-base sm:text-lg font-bold text-[#142d5a] uppercase tracking-normal">
                CARTA DE COMPROMISO Y CONDICIONES DE USO DE ESPACIOS
              </h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                CENTRO COMUNITARIO DIAGUITAS — MUNICIPALIDAD DE LAS CONDES
              </p>
            </div>

            {/* 1. IDENTIFICACIÓN DEL SOLICITANTE / TITULAR RESPONSABLE */}
            <div className="space-y-0">
              <div className="bg-[#182b49] text-white font-bold px-3 py-1 text-[11px] uppercase tracking-wide">
                1. IDENTIFICACIÓN DEL SOLICITANTE / TITULAR RESPONSABLE
              </div>
              <div className="border border-[#b4c3d7] border-t-0 text-[11px] text-slate-800 divide-y divide-[#b4c3d7]">
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Nombre Completo:</span>{' '}
                    <span>{(localData.responsable || '__________________________________________').toUpperCase()}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Cédula / R.U.T.:</span>{' '}
                    <span className="font-mono">{(localData.rut || '______________________').toUpperCase()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Teléfono Contacto:</span>{' '}
                    <span>{(localData.telefonoContacto || '__________________________________________').toUpperCase()}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Correo Electrónico:</span>{' '}
                    <span>{(localData.emailContacto || '______________________').toUpperCase()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Domicilio / Dirección:</span>{' '}
                    <span>{(localData.domicilio || '__________________________________________').toUpperCase()}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Tipo de Actividad:</span>{' '}
                    <span>{(localData.tipoActividad || 'PRÉSTAMO DE ESPACIO').toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. DETALLES DEL ESPACIO Y HORARIO AUTORIZADO */}
            <div className="space-y-0 pt-0.5">
              <div className="bg-[#182b49] text-white font-bold px-3 py-1 text-[11px] uppercase tracking-wide">
                2. DETALLES DEL ESPACIO Y HORARIO AUTORIZADO
              </div>
              <div className="border border-[#b4c3d7] border-t-0 text-[11px] text-slate-800 divide-y divide-[#b4c3d7]">
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Fecha y Día:</span>{' '}
                    <span>{point2Details.fechaDiaStr || '__________________________________________'}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Horario Autorizado:</span>{' '}
                    <span>{point2Details.horarioStr || '______________________'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Espacio Asignado:</span>{' '}
                    <span className="font-bold text-slate-900">{point2Details.espacioStr || '__________________________________________'}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Modalidad / Tipo:</span>{' '}
                    <span>{point2Details.modalidadStr || '______________________'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#b4c3d7]">
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Aforo Estimado:</span>{' '}
                    <span>{point2Details.aforoStr || '__________________________________________'}</span>
                  </div>
                  <div className="px-3 py-1">
                    <span className="font-semibold text-slate-900">Propósito / Evento:</span>{' '}
                    <span>{point2Details.propositoStr || '______________________'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. MARCO LEGAL, COMPROMISOS DE COMPORTAMIENTO Y CONDICIONES DE USO */}
            <div className="space-y-1.5 pt-0.5">
              <div className="bg-[#182b49] text-white font-bold px-3 py-1 text-[11px] uppercase tracking-wide">
                3. MARCO LEGAL, COMPROMISOS DE COMPORTAMIENTO Y CONDICIONES DE USO
              </div>

              {/* Complete clauses 1 to 11 occupying full page space */}
              <div className="space-y-1.5 text-[10px] leading-relaxed text-slate-800">
                <div>
                  <span className="font-bold text-slate-950 uppercase">1. NATURALEZA JURÍDICA Y AUTORIZACIÓN PRECARIA DE USO:</span>{' '}
                  <span className="text-justify">
                    Este documento no es un arriendo ni un préstamo pagado: es una autorización precaria para usar un espacio municipal por un tiempo determinado (comodato precario, Arts. 2174, 2194 y 2195 Código Civil; Arts. 5° letra c) y 36 Ley N° 18.695). «Comodato» es un préstamo gratuito que se devuelve en las mismas condiciones; «precario» significa que se otorga por mera tolerancia, sin plazo garantizado, y puede terminarse antes si la Municipalidad lo decide.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">2. GRATUIDAD ABSOLUTA Y PROHIBICIÓN DE LUCRO:</span>{' '}
                  <span className="text-justify">
                    El uso del espacio es completamente gratuito (Art. 2174 inc. 1° Código Civil; Arts. 41 y 42 D.L. N° 3.063; Art. 36 Ley N° 18.695). Queda prohibido cobrar entradas, aportes u otro pago, o vender productos dentro del recinto sin autorización expresa del municipio.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">3. TRATO DIGNO Y RESPETO IRRESTRICTO A FUNCIONARIOS, VECINOS Y OTROS USUARIOS:</span>{' '}
                  <span className="text-justify">
                    El solicitante y sus invitados deben tratar con respeto a otros vecinos o usuarios del Centro Comunitario, a los funcionarios municipales, coordinadores, personal de aseo y personal de seguridad. Insultar, amenazar o agredir a un funcionario en ejercicio de sus funciones puede constituir delito (Arts. 261, 262, 264 y 296 Código Penal), en el marco de prevención institucional de la Ley N° 21.643 (Ley Karin). Una falta grave permite suspender la actividad, pedir auxilio de la fuerza pública, desalojar e inhabilitar al solicitante.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">4. CONDUCTO REGULAR Y CANALIZACIÓN EXCLUSIVA ANTE LA JEFATURA:</span>{' '}
                  <span className="text-justify">
                    Cualquier problema, reclamo o desperfecto debe informarse de manera formal EXCLUSIVAMENTE a la jefatura o administración del Centro Comunitario, y no discutirse con el personal de turno (Arts. 3°, 7° y 24 Ley N° 19.880; Arts. 52 y 53 Ley N° 18.575).
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">5. MANTENER EL ESPACIO LIMPIO Y EN BUEN ESTADO:</span>{' '}
                  <span className="text-justify">
                    El solicitante debe mantener el espacio limpio y en buen estado durante toda la actividad, y devolverlo tal como lo recibió (Arts. 2178, 2179 y 2180 Código Civil).
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">6. PUNTUALIDAD RIGUROSA Y HORARIO CONCEDIDO:</span>{' '}
                  <span className="text-justify">
                    El horario autorizado debe respetarse estrictamente, inicio y término (Arts. 1545 y 2180 N° 1 Código Civil; Art. 5° letra c) Ley N° 18.695; Ordenanza Comunal). Como el Centro Comunitario recibe muchas actividades en paralelo, si la actividad se extiende o corre riesgo de exceder el tiempo autorizado, el solicitante debe avisar de inmediato a la administración. No está permitido exigir directamente a la persona o grupo que esté usando la sala que la desocupe: cualquier situación de este tipo debe informarse a la administración, quien coordinará la solución.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">7. PROHIBICIÓN TOTAL DE ALCOHOL, TABACO Y SUSTANCIAS:</span>{' '}
                  <span className="text-justify">
                    No se permite portar, vender ni consumir alcohol (Arts. 25 y 26 Ley N° 19.925), ni fumar o usar cigarrillos electrónicos en espacios interiores o patios (Arts. 10 y 11 Leyes N° 20.660 y 21.575). Tampoco se permite portar ni consumir sustancias estupefacientes o psicotrópicas, sancionado como falta (Art. 50 Ley N° 20.000), sin perjuicio de responsabilidades penales mayores si la conducta excede el simple consumo personal.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">8. CONVIVENCIA, RUIDO MODERADO Y ORDEN PÚBLICO:</span>{' '}
                  <span className="text-justify">
                    Debe mantenerse un volumen moderado, sin molestar a los vecinos ni a otras actividades del Centro Comunitario (D.S. N° 38/2011 MMA; Arts. 495 N° 1 y 496 N° 1 y 5 Código Penal; Art. 4° letra h) Ley N° 18.695).
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">9. ASEO, HIGIENE Y RETIRO DE RESIDUOS:</span>{' '}
                  <span className="text-justify">
                    Al finalizar, el solicitante debe retirar toda la basura, dejando el recinto limpio y las bolsas en los contenedores habilitados (Arts. 78, 79 y 80 Código Sanitario DFL N° 725; Art. 494 N° 3 Código Penal; Ordenanza Municipal).
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">10. FACULTAD DE SUSPENSIÓN INMEDIATA Y DESALOJO POR INCUMPLIMIENTO DEL SOLICITANTE:</span>{' '}
                  <span className="text-justify">
                    Por ser un comodato precario, la administración y la autoridad municipal pueden suspender, revocar o dejar sin efecto de inmediato la autorización, y disponer el desalojo con auxilio de la fuerza pública, ante falta de respeto, incumplimiento o desórdenes graves (Arts. 2194 y 2195 Código Civil; Arts. 5°, 36 y 63 letras f) e i) Ley N° 18.695; Art. 61 Ley N° 19.880). No procede indemnización ni reclamo, y el solicitante puede quedar inhabilitado.
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-950 uppercase">11. FACULTAD DE LA MUNICIPALIDAD PARA REPROGRAMAR O CANCELAR EL PRÉSTAMO POR NECESIDAD SUPERIOR:</span>{' '}
                  <span className="text-justify">
                    Por ser una autorización gratuita y precaria, la Municipalidad puede disponer del espacio ante una necesidad superior o institucional (emergencia, actividad municipal prioritaria, reparación o contingencia de infraestructura), conforme a los Arts. 2194 y 2195 Código Civil, Arts. 5° letra c) y 36 Ley N° 18.695, y Art. 61 Ley N° 19.880 (revocación por mérito, oportunidad o conveniencia). Podrá modificar el horario, reprogramar o cancelar el préstamo, avisando al solicitante con la debida anticipación —salvo caso fortuito o fuerza mayor— y, de ser posible, ofreciendo una alternativa. No genera derecho a indemnización.
                  </span>
                </div>
              </div>
            </div>

            {/* Juramento Statement */}
            <div className="pt-1 text-[10px] italic text-slate-800 text-justify leading-relaxed">
              Declaro bajo fe de juramento haber leído, comprendido y aceptado en su totalidad las condiciones precedentes, reconociendo el carácter gratuito de la facilitación, su naturaleza no contractual y la plena facultad legal de suspensión inmediata e inhabilitación ante cualquier incumplimiento normativo.
            </div>

            {/* Separator Line */}
            <div className="pt-2">
              <div className="border-t border-[#b4c3d7] w-full" />
            </div>

            {/* Signatures Two Columns */}
            <div className="pt-2 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-8 text-[10.5px]">
              {/* Column 1: Solicitante */}
              <div className="space-y-1">
                <div className="font-bold text-slate-950 uppercase tracking-wide">
                  FIRMA DEL SOLICITANTE
                </div>
                <div className="pt-4 border-b border-slate-300 w-4/5" />
                <div className="text-slate-800 pt-1">
                  Nombre: <span className="font-semibold text-slate-950">{(localData.responsable || '____________________________________').toUpperCase()}</span>
                </div>
                <div className="text-slate-800">
                  RUT: <span className="font-mono">{(localData.rut || '____________________________________').toUpperCase()}</span>
                </div>
              </div>

              {/* Column 2: Administración */}
              <div className="space-y-1">
                <div className="font-bold text-slate-950 uppercase tracking-wide">
                  ADMINISTRACIÓN CENTRO COMUNITARIO DIAGUITAS
                </div>
                <div className="pt-4 border-b border-slate-300 w-4/5" />
                <div className="text-slate-500 italic text-[10px] pt-1">
                  Firma y Timbre de Autorización
                </div>
              </div>
            </div>

            {/* Footer Page 1 */}
            <div className="pt-2 text-right text-[10px] text-slate-500 font-mono">
              Folio: {folioNumber} | Papel: 8.5" × 13" (Oficio) | Centro Comunitario Diaguitas
            </div>
          </div>

          {/* ============================================================== */}
          {/* OPTIONAL MULTI-SLOT CALENDAR ANNEX (PAGE 2)                    */}
          {/* ============================================================== */}
          {isMultiSlot && rangeInfo.slots.length > 1 && (
            <div className="bg-white p-6 sm:p-9 rounded-2xl shadow-sm border border-slate-200 text-slate-900 space-y-3 text-xs leading-relaxed max-w-[215.9mm] mx-auto print:border-none print:shadow-none print:p-0 print:rounded-none print:m-0 print:break-before-page">
              <div className="text-[10px] text-slate-600 uppercase tracking-wide">
                CENTRO COMUNITARIO DIAGUITAS | MUNICIPALIDAD DE LAS CONDES
              </div>

              <div className="pt-1">
                <h3 className="font-bold text-slate-950 text-xs uppercase tracking-wide flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>
                    ANEXO: CALENDARIO DETALLADO DE SESIONES ({rangeInfo.totalSessions} SESIONES {Boolean(reservationData.id && reservationData.estado === 'activa') ? 'AUTORIZADAS' : 'PROGRAMADAS (BORRADOR)'})
                  </span>
                </h3>
                <p className="text-slate-600 text-[11px]">
                  Folio: {folioNumber} | Solicitante: {(localData.responsable || '__________________________________________').toUpperCase()}
                </p>
              </div>

              <div className="rounded-xl border border-slate-300 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800 text-white font-bold text-[11px]">
                    <tr>
                      <th className="py-2 px-3 text-center w-10">N°</th>
                      <th className="py-2 px-3">Fecha y Día</th>
                      <th className="py-2 px-3">Espacio Asignado</th>
                      <th className="py-2 px-3 text-center">Horario {Boolean(reservationData.id && reservationData.estado === 'activa') ? 'Autorizado' : 'Solicitado'}</th>
                      <th className="py-2 px-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rangeInfo.slots.map((slot, index) => {
                      let formattedDay = '';
                      try {
                         formattedDay = format(parseISO(slot.fecha), "EEEE d 'de' MMMM, yyyy", { locale: es });
                        formattedDay = formattedDay.charAt(0).toUpperCase() + formattedDay.slice(1);
                      } catch {
                        formattedDay = formatDateDDMMYYYY(slot.fecha);
                      }

                      const isConfirmed = Boolean(reservationData.id && reservationData.estado === 'activa');

                      return (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                          <td className="py-2 px-3 text-center font-bold text-slate-500">{index + 1}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{formattedDay}</td>
                          <td className="py-2 px-3 font-bold text-blue-900 uppercase">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-950 font-bold text-[11px]">
                              {slot.espacio}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                            {slot.horaInicio} a {slot.horaFin} hrs.
                          </td>
                          <td className={`py-2 px-3 text-center font-semibold text-[11px] ${
                            isConfirmed ? 'text-emerald-700' : 'text-amber-700'
                          }`}>
                            {isConfirmed ? 'Autorizado' : 'Borrador'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pt-4 text-right text-[10px] text-slate-500 font-mono">
                {folioNumber} · Versión corregida | Página 3 (Anexo)
              </div>
            </div>
          )}

        </div>

        {/* Bottom Footer Close (Hidden in Print) */}
        <div className="px-6 py-3 bg-slate-200 border-t border-slate-300 flex items-center justify-between shrink-0 print:hidden text-xs">
          <span className="text-slate-600">
            Documento oficial para emisión, firma y archivo en el Centro Comunitario Diaguitas
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold transition shadow-2xs cursor-pointer"
          >
            Cerrar Carta
          </button>
        </div>

      </div>
    </ModalOverlay>
  );
};
