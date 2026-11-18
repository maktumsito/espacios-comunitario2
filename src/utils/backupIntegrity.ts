/** Integrity of exported data, including UTF-8 byte length. Legacy CHK files are
 * checked using their original algorithm; new exports use SHA-256. */
export async function backupChecksum(serialized: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return (
    "SHA256_" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function legacyBackupChecksum(serialized: string) {
  let hash = 0;
  for (let i = 0; i < serialized.length; i++)
    hash = ((hash << 5) - hash + serialized.charCodeAt(i)) | 0;
  return `CHK_${Math.abs(hash).toString(16).toUpperCase().padStart(8, "0")}`;
}
export async function validateBackupRecord(
  record: any,
  serialized = JSON.stringify(record.data),
) {
  const data = record.data;
  if (
    !data ||
    ![
      "reservas",
      "espacios",
      "tiposPrestamo",
      "tiposActividad",
      "equipamiento",
      "usuarios",
      "calificaciones",
    ].every((k) => Array.isArray(data[k]))
  )
    throw new Error("El respaldo no contiene todas las entidades esperadas.");
  if (data.bloqueos !== undefined && !Array.isArray(data.bloqueos))
    throw new Error("Lista de bloqueos inválida.");
  for (const key of [
    "reservas",
    "equipamiento",
    "calificaciones",
    "bloqueos",
  ]) {
    const rows = data[key] || [];
    if (
      rows.some(
        (r: any) =>
          !r || typeof r.id !== "string" || !r.id || r.id.includes("/"),
      ) ||
      new Set(rows.map((r: any) => r.id)).size !== rows.length
    )
      throw new Error(`IDs inválidos o duplicados en ${key}.`);
  }
  if (typeof record.checksum !== "string" || !record.checksum)
    throw new Error("El respaldo no tiene checksum. No se restauró.");
  const calculated = record.checksum.startsWith("CHK_")
    ? legacyBackupChecksum(serialized)
    : await backupChecksum(serialized);
  if (calculated !== record.checksum)
    throw new Error("El checksum del respaldo no coincide. No se restauró.");
  if (record.tamanoBytes !== new TextEncoder().encode(serialized).byteLength)
    throw new Error("El tamaño del respaldo no coincide.");
  for (const [field, key] of [
    ["totalReservas", "reservas"],
    ["totalEspacios", "espacios"],
    ["totalEquipamiento", "equipamiento"],
    ["totalUsuarios", "usuarios"],
    ["totalCalificaciones", "calificaciones"],
  ])
    if (record[field] !== data[key].length)
      throw new Error(`Cantidad incorrecta: ${field}.`);
}
