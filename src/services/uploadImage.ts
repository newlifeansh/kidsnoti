const MAX_UPLOAD_IMAGE_DIMENSION = 1600;
const MAX_UPLOAD_IMAGE_BYTES = 1_500_000;

export async function optimizeUploadImages(files: File[]) {
  const optimizedFiles: File[] = [];

  for (const file of files) {
    optimizedFiles.push(await optimizeUploadImage(file));
  }

  return optimizedFiles;
}

async function optimizeUploadImage(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImage(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const shouldResize =
    longestSide > MAX_UPLOAD_IMAGE_DIMENSION || file.size > MAX_UPLOAD_IMAGE_BYTES;

  if (!shouldResize) {
    return file;
  }

  const scale = Math.min(1, MAX_UPLOAD_IMAGE_DIMENSION / longestSide);
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const preferredMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const preferredBlob = await canvasToBlob(
    canvas,
    preferredMimeType,
    preferredMimeType === "image/jpeg" ? 0.9 : undefined,
  );

  const fallbackBlob =
    preferredBlob.size > MAX_UPLOAD_IMAGE_BYTES && preferredMimeType !== "image/jpeg"
      ? await canvasToBlob(canvas, "image/jpeg", 0.9)
      : preferredBlob;
  const finalMimeType = fallbackBlob.type || preferredMimeType;
  const finalName =
    finalMimeType === "image/jpeg"
      ? file.name.replace(/\.(png|webp)$/i, ".jpg")
      : file.name;

  return new File([fallbackBlob], finalName, {
    type: finalMimeType,
    lastModified: file.lastModified,
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 불러오지 못했어요."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("이미지 최적화에 실패했어요."));
    }, type, quality);
  });
}
