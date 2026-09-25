import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

const documents = new Map<string, Promise<PDFDocumentProxy>>()

export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let pending = documents.get(url)
  if (!pending) {
    pending = getDocument({ url }).promise
    pending.catch(() => documents.delete(url))
    documents.set(url, pending)
  }
  return pending
}

export async function renderPdfPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<{ aspectRatio: number }> {
  const page = await document.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * pixelRatio })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  return { aspectRatio: base.width / base.height }
}
