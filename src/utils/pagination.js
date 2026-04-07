const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Menormalkan page dan limit query agar list endpoint memakai batas data yang aman.
export function resolvePagination(page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
  const currentPage = Number(page) > 0 ? Number(page) : DEFAULT_PAGE;
  const currentLimit = Number(limit) > 0 ? Math.min(Number(limit), MAX_LIMIT) : DEFAULT_LIMIT;

  return {
    page: currentPage,
    limit: currentLimit,
    offset: (currentPage - 1) * currentLimit
  };
}

// Menyusun metadata pagination agar frontend tahu posisi halaman saat ini.
export function buildPaginationMeta(total, page, limit) {
  return {
    page,
    limit,
    total,
    total_pages: total > 0 ? Math.ceil(total / limit) : 0
  };
}
