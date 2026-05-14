import { printifyFetch, shopPath, PrintifyError } from './client';

// Best-effort delete; returns true if Printify accepted it, false if it
// returned 404 (already gone) or another non-fatal code. Throws on auth/
// connectivity errors so the caller can log them, but the caller may choose
// to swallow the throw and proceed with the DB delete.
export async function deletePrintifyProduct(productId: string): Promise<boolean> {
  try {
    await printifyFetch<void>(shopPath(`/products/${productId}.json`), { method: 'DELETE' });
    return true;
  } catch (err) {
    if (err instanceof PrintifyError && err.status === 404) return false;
    throw err;
  }
}
