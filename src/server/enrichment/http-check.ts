/**
 * Prueft, ob eine URL erreichbar ist (spec §2 Ebene 2: "erfundene Links fliegen
 * dadurch auf"). HEAD zuerst (billiger), Fallback auf GET fuer Server ohne
 * HEAD-Unterstuetzung.
 */
export async function checkUrl(url: string, timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!res.ok && res.status !== 405) return false;
    if (res.status === 405) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
