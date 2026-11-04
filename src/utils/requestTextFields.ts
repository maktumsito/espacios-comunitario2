// Treat labeled fields as independent blocks, even when pasted on a single line.
// Keep line breaks out of the separator so field values cannot swallow the next block.
const fieldLabels = 'nombre(?:[ \\t]+completo)?|solicitante|responsable|profesor(?:a)?|encargad[oa]|rut|run|r\\.u\\.t\\.?|tel[eé]fono|tel|celular|cel|fono|whatsapp|correo|email|mail|domicilio|direcci[oó]n|actividad|taller|motivo|descripci[oó]n|evento|asunto|espacio|sala|fecha(?:[ \\t]+(?:de[ \\t]+)?(?:inicio|fin|t[eé]rmino))?|horario|hora[ \\t]+(?:inicio|fin|t[eé]rmino)|inicio|fin|t[eé]rmino|participantes|asistentes|aforo|equipos|equipamiento|montaje';
const nextLabel = new RegExp(`(^|[ \\t]+)(${fieldLabels})[ \\t]*([:=])`, 'gim');

export function separateRequestFields(text: string): string {
  return text.replace(nextLabel, (_, prefix: string, label: string, separator: string) => `${prefix ? '\n' : ''}${label}${separator}`);
}
