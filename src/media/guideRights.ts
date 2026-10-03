// The guide text's source line for sheet 20 (F5): holder and licence from the pack's C-13 projection
// (BL8), the source title verbatim from the C-13 record (R-312).
import { useEffect, useState } from 'react';
import { DATA_PATHS, fetchJson } from '../settings/data';
import {
  packLineParts,
  parseLicenseInfo,
  parsePackRights,
  parseRightsRecords,
} from '../settings/rights';
import type { SheetRights } from './sheet';

/** The guide text's own source line (FIATranslationGuide in the pack's C-13 projection, BL8). */
export function useGuideRights(packId: string | undefined, on: boolean): SheetRights | undefined {
  const [rights, setRights] = useState<SheetRights>();
  useEffect(() => {
    if (!on || !packId) return;
    let live = true;
    Promise.all([fetchJson(DATA_PATHS.packRights(packId)), fetchJson(DATA_PATHS.rights)])
      .then(([pack, records]) => {
        const line = parsePackRights(pack).find((l) => l.collection === 'FIATranslationGuide');
        const parts = packLineParts(line);
        const rec = parseRightsRecords(records).rows.find((r) => r.collection === line?.collection);
        const source = rec ? parseLicenseInfo(rec.licenseInfo).title : undefined;
        if (live && parts && source)
          setRights({ source, holder: parts.holder, licence: parts.licence });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [packId, on]);
  return rights;
}
