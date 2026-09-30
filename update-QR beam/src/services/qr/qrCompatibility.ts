/** Native BarcodeDetector (text QR only — rawValue is a string, so it is NOT used for binary data QR). */
export async function createNativeQrDetector(): Promise<null | { detect(src: CanvasImageSource): Promise<string[]> }> {
  const BD = (globalThis as any).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats: string[] = await BD.getSupportedFormats();
    if (!formats.includes('qr_code')) return null;
    const d = new BD({ formats: ['qr_code'] });
    return { detect: async (src) => (await d.detect(src)).map((r: any) => String(r.rawValue)) };
  } catch { return null; }
}
