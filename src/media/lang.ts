import { languageByCode } from '../i18n/languages';

/** Autonym for a content language code (marks read `not yet in {language}`, R-607). */
export const languageName = (code: string) => languageByCode(code)?.autonym ?? code;
