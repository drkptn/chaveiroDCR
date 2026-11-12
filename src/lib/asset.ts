/** Prefixa caminhos de /public com o basePath (GitHub Pages etc.). */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
export const asset = (path: string) => `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
