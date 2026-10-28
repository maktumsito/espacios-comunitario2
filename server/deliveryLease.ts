import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

/** A provider call cannot be atomic with Firestore. Once delivery starts, an
 * uncertain outcome requires reconciliation; it must never trigger a resend. */
export async function claimDelivery(
  db: Firestore,
  cycle: string,
  now = Date.now(),
  immediateStart = false,
) {
  const owner = randomUUID(),
    ref = db.doc(`_email_dispatches/${cycle}`),
    status = immediateStart ? "delivery_started" : "claimed";
  const claimed = await db.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data();
    if (
      old &&
      (["delivery_started", "sent", "needs_reconciliation"].includes(
        old.status,
      ) ||
        old.expiresAt > now)
    )
      return false;
    tx.set(ref, {
      owner,
      status,
      expiresAt: now + 30 * 60000,
      updatedAt: new Date(now).toISOString(),
    });
    return true;
  });
  return claimed ? { owner, cycle, status } : null;
}
export async function startDelivery(
  db: Firestore,
  claim: { owner: string; cycle: string; status?: string },
) {
  if (claim.status === "delivery_started") return;
  const ref = db.doc(`_email_dispatches/${claim.cycle}`);
  await db.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data();
    if (old?.owner === claim.owner && old.status === "delivery_started") return;
    if (
      old?.owner !== claim.owner ||
      old.status !== "claimed" ||
      old.expiresAt <= Date.now()
    )
      throw new Error("La reserva del despacho venció. No se envió correo.");
    tx.update(ref, {
      status: "delivery_started",
      updatedAt: new Date().toISOString(),
    });
  });
  claim.status = "delivery_started";
}
export async function finishDelivery(
  db: Firestore,
  claim: { owner: string; cycle: string },
  sent: boolean,
  messageId?: string,
) {
  const ref = db.doc(`_email_dispatches/${claim.cycle}`);
  await db.runTransaction(async (tx) => {
    const old = (await tx.get(ref)).data();
    if (old?.owner !== claim.owner) return;
    tx.update(ref, {
      status: sent ? "sent" : "needs_reconciliation",
      messageId: messageId || null,
      updatedAt: new Date().toISOString(),
    });
  });
}
