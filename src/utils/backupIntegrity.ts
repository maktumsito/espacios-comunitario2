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
  if (data.version === '3.0.0' && (!Array.isArray(data.inventario) || !Object.hasOwn(data, 'stockTortas'))) {
    throw new Error('El respaldo no incluye inventario y stock.');
  }
  if (data.inventario !== undefined) {
    const validId = (id: unknown) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
    const unique = (rows: Array<{ id: string }>) => new Set(rows.map(row => row.id)).size === rows.length;
    if (!Array.isArray(data.inventario) || data.inventario.some((place: any) =>
      !place || !validId(place.id) || typeof place.data?.name !== 'string' ||
      (place.data.generation && !/^[a-f0-9-]{36}$/.test(place.data.generation)) ||
      !Array.isArray(place.articulos) || place.articulos.some((item: any) =>
        !item || !validId(item.id) || typeof item.data?.name !== 'string' ||
        !Number.isSafeInteger(item.data.quantity) || item.data.quantity < 0) || !unique(place.articulos)) || !unique(data.inventario)) {
      throw new Error('El inventario del respaldo no es válido.');
    }
  }
  if (data.stockTortas !== undefined && data.stockTortas !== null) {
    const { capacity, available, allocations } = data.stockTortas;
    if (!Number.isSafeInteger(capacity) || capacity < 0 || !Number.isSafeInteger(available) || available < 0 ||
      !allocations || typeof allocations !== 'object' || Array.isArray(allocations) ||
      Object.values(allocations).some((allocation: any) => !Number.isSafeInteger(allocation?.quantity) || allocation.quantity <= 0) ||
      Object.values(allocations).reduce<number>((total, allocation: any) => total + allocation.quantity, 0) !== capacity - available) {
      throw new Error('El saldo de tortas del respaldo no concuerda con sus asignaciones.');
    }
  }
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
