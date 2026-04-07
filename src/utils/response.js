// Membungkus payload sukses agar semua endpoint mengembalikan bentuk yang konsisten.
export function successResponse(data, meta = null) {
  const response = {
    success: true,
    data
  };

  if (meta && Object.keys(meta).length > 0) {
    response.meta = meta;
  }

  return response;
}

// Membungkus error agar frontend selalu menerima kode dan pesan yang seragam.
export function errorResponse(code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message
    }
  };

  if (details != null) {
    response.error.details = details;
  }

  return response;
}
