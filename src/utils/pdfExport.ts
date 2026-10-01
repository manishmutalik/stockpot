/**
 * pdfExport.ts
 *
 * Turns rendered pages into a PDF file, entirely in the browser. html2canvas
 * draws each page element to an image and jsPDF wraps those images into one
 * A4 PDF, one image per page. Both libraries are loaded on first use, since
 * they are large and most visits never share a PDF.
 *
 * Kept generic (it takes elements, not menus) so other reports can reuse it.
 */

/** A4 in PDF points. */
const A4 = { width: 595.28, height: 841.89 };

/**
 * Builds a PDF with one A4 page per image (data URLs, JPEG or PNG), each
 * stretched to the page. The page elements are already A4-shaped, so there is
 * no distortion.
 */
export async function imagesToPdf(images: string[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  images.forEach((image, i) => {
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(image, image.startsWith('data:image/png') ? 'PNG' : 'JPEG', 0, 0, A4.width, A4.height, undefined, 'FAST');
  });
  return pdf.output('blob');
}

/** Renders each element to an image (2x for sharp text) and returns them as a PDF file, or null if drawing failed. */
export async function elementsToPdf(elements: HTMLElement[], fileName: string): Promise<File | null> {
  if (elements.length === 0) return null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const images: string[] = [];
    for (const element of elements) {
      const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      images.push(canvas.toDataURL('image/jpeg', 0.92));
    }
    const blob = await imagesToPdf(images);
    return new File([blob], fileName, { type: 'application/pdf' });
  } catch {
    return null;
  }
}
