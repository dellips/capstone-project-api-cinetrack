// Membuat objek error HTTP sederhana agar handler global bisa membaca status dan kode error.
export function createHttpError(statusCode, message, errorCode = null, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  error.details = details;
  return error;
}
