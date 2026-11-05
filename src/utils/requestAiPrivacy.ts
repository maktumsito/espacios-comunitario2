type PersonalFields = Partial<Record<'responsable' | 'rut' | 'telefonoContacto' | 'emailContacto' | 'domicilio', string>>;

/** Called in the browser before networking; the applicant directory never leaves it. */
export function redactRequestPersonalData(text: string, detected: PersonalFields = {}): string {
  let redacted = text.normalize('NFC');
  const values = (['responsable', 'rut', 'telefonoContacto', 'emailContacto', 'domicilio'] as const).map(key => detected[key]);
  for (const value of values.filter((v): v is string => !!v?.trim()).sort((a, b) => b.length - a.length)) {
    const escaped = value.trim().normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    redacted = redacted.replace(new RegExp(escaped, 'gi'), '[DATO PERSONAL]');
  }
  if (detected.rut) {
    const compactRut = detected.rut.replace(/[^\dk]/gi, '');
    if (compactRut.length >= 8) redacted = redacted.replace(new RegExp(`(?<![\\dk])${compactRut.split('').join('[\\s.-]*')}(?![\\dk])`, 'gi'), '[RUT]');
  }
  return redacted
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[CORREO]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dk]\b/gi, '[RUT]')
    .replace(/(?<!\d)(?:\+?56[ .-]*)?9(?:[ .-]*\d){8}(?!\d)/g, '[TELÉFONO]')
    .replace(/\b(?:rut|tel[eé]fono|tel|fono|celular|correo|email|domicilio|direcci[oó]n|solicitante|responsable|nombre)\s*[:=]\s*[^,;\n]+?(?=\s+(?:solicita|necesita|requiere|para)\b|[,;\n]|$)/gi, '[DATO PERSONAL]');
}
