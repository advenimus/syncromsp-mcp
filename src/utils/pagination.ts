export interface PaginationParams {
  page?: number;
}

export function addPaginationParams(
  params: URLSearchParams,
  pagination?: PaginationParams
): void {
  if (pagination?.page !== undefined) {
    params.set("page", String(pagination.page));
  }
}

export interface PaginationInfo {
  page?: number;
  total_pages?: number;
  total_entries?: number;
  per_page?: number;
}

export function formatPaginationInfo(meta: PaginationInfo | undefined): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.page !== undefined) parts.push(`Page ${meta.page}`);
  if (meta.total_pages !== undefined) parts.push(`of ${meta.total_pages}`);
  if (meta.total_entries !== undefined) parts.push(`(${meta.total_entries} total)`);
  return parts.length > 0 ? `\n---\n${parts.join(" ")}` : "";
}
