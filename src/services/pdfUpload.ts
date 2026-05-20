const MAX_PDF_PAGES = 8;
const MAX_RENDER_WIDTH = 1800;

export async function convertPdfFilesToImages(files: File[]) {
  const convertedFiles: File[] = [];

  for (const file of files) {
    convertedFiles.push(...await convertPdfToImages(file));
  }

  return convertedFiles;
}

async function convertPdfToImages(file: File) {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const files: File[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_RENDER_WIDTH / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("PDF 페이지를 이미지로 변환하지 못했어요.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;

    const blob = await canvasToBlob(canvas);
    const safeName = file.name.replace(/\\.pdf$/i, "");
    files.push(new File([blob], `${safeName}-${pageNumber}.png`, { type: "image/png" }));
  }

  return files;
}

async function loadPdfJs() {
  const [pdfjsLib, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs?url"),
  ]);

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  return pdfjsLib;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("PDF 페이지 이미지를 만들지 못했어요."));
    }, "image/png");
  });
}
