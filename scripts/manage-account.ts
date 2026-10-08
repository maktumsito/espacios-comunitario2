import { getServerDatabase } from "../server/database";
import { hashPassword } from "../server/passwords";

// Explicit maintenance tool. No default credentials, no public bootstrap route,
// no .env loading. Production requires ADC and an explicit --production flag.
const args = process.argv.slice(2),
  value = (key: string) => args[args.indexOf(key) + 1];
if (
  process.env.VITE_LOCAL_TEST_MODE !== "true" &&
  !args.includes("--production")
)
  throw new Error(
    "Indica VITE_LOCAL_TEST_MODE=true para demo-espacios o --production para una intervención explícita con ADC.",
  );
const username = args.includes("--username")
  ? value("--username").trim().toLowerCase()
  : "";
if (!username || username.length > 150) throw new Error("Indica --username.");
const password = process.env.ACCOUNT_PASSWORD;
delete process.env.ACCOUNT_PASSWORD;
if (!password)
  throw new Error(
    "Proporciona ACCOUNT_PASSWORD temporalmente; no incluyas la contraseña en los argumentos.",
  );
const passwordHash = await hashPassword(password),
  db = getServerDatabase();
try {
  const id = encodeURIComponent(username).replace(/\./g, "_");
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`usuarios_sistema/${id}`),
      old = (await tx.get(ref)).data();
    if (!old && !args.includes("--name"))
      throw new Error("Indica --name para dar de alta un perfil nuevo.");
    tx.set(ref, {
      ...old,
      username,
      name: old?.name || value("--name"),
      role: old?.role || "Administrador",
      initials: old?.initials || "AD",
      avatarColor: old?.avatarColor || "bg-blue-600",
      ...(args.includes("--master") ? { isMasterAdmin: true } : {}),
      passwordHash,
      sessionVersion: (old?.sessionVersion || 0) + 1,
      createdAt: old?.createdAt || new Date().toISOString(),
    });
  });
  console.log(
    "Credenciales individuales actualizadas; las sesiones anteriores quedaron invalidadas.",
  );
} finally {
  await db.terminate();
}
