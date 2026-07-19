export type Locale = 'en' | 'zh';

export const LOCALES: Locale[] = ['en', 'zh'];
export const DEFAULT_LOCALE: Locale = 'en';

// BCP-47 tag used for <html lang>, hreflang, and JSON-LD inLanguage.
export function bcp47(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

// Maps a pathname to its equivalent in the other locale. Root-relative,
// leading slash, no trailing slash (matches trailingSlash: 'never').
export function zhPathFor(enPathname: string): string {
  return enPathname === '/' ? '/zh' : `/zh${enPathname}`;
}

export function enPathFor(zhPathname: string): string {
  const stripped = zhPathname.replace(/^\/zh(?=\/|$)/, '');
  return stripped === '' ? '/' : stripped;
}
