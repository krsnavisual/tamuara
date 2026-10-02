// Keep multipart requests below the hosting limit, including form boundaries.
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_REQUEST_BYTES = MAX_IMAGE_UPLOAD_BYTES + 64 * 1024;
export const IMAGE_UPLOAD_SIZE_ERROR =
  "Ukuran gambar maksimal 4 MB. Kecilkan ukuran foto lalu coba lagi.";
export const IMAGE_UPLOAD_HINT =
  "JPG, PNG, atau WebP, maksimal 4 MB per foto. Foto dioptimalkan saat unggah.";

export function imageUploadError(file: Pick<File, "size" | "type">) {
  if (file.size <= 0) return "File gambar kosong. Pilih gambar lain.";
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return IMAGE_UPLOAD_SIZE_ERROR;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Gunakan gambar JPG, PNG, atau WebP.";
}
