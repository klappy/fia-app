// Screen inventory (ALPHA-PRD R-807; ids per ALPHA-JOURNEYS § 0). One route per screen S01–S19
// and one per sheet SH-1..SH-5. Slugs follow the string tables in design/alpha-screens.
export type ScreenId =
  | 'S01'
  | 'S02'
  | 'S03'
  | 'S04'
  | 'S05'
  | 'S06'
  | 'S07'
  | 'S08'
  | 'S09'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13'
  | 'S14'
  | 'S15'
  | 'S16'
  | 'S17'
  | 'S18'
  | 'S19'
  | 'SH-1'
  | 'SH-2'
  | 'SH-3'
  | 'SH-4'
  | 'SH-5';

export interface ScreenDef {
  id: ScreenId;
  /** Storyboard frame number 01–24. */
  frame: number;
  name: string;
  slug: string;
  path: string;
  /** Title key; `null` = the screen has no title string in its spec, the name is used. */
  titleKey: string | null;
  /** Primary-button label key; `null` = the screen has no next action (rule 1). */
  primaryKey: string | null;
  /** Dock visible (dock.md: hidden on 01, 11, 12, 17 and on sheets). */
  dock: boolean;
  kind: 'screen' | 'sheet';
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'S01',
    frame: 1,
    name: 'First run / language',
    slug: 'lang',
    path: '/',
    titleKey: 's.lang.title',
    primaryKey: 's.lang.primary-idle',
    dock: false,
    kind: 'screen',
  },
  {
    id: 'S02',
    frame: 2,
    name: 'Library',
    slug: 'library',
    path: '/library',
    titleKey: null,
    primaryKey: 's.library.primary-continue',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S03',
    frame: 3,
    name: 'Pericope list',
    slug: 'pericopes',
    path: '/pericopes',
    titleKey: null,
    primaryKey: 's.pericopes.primary-start',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S04',
    frame: 4,
    name: 'Passage card',
    slug: 'passage',
    path: '/passage',
    titleKey: null,
    primaryKey: 's.passage.primary-start',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S05',
    frame: 5,
    name: 'Guide',
    slug: 'guide',
    path: '/guide',
    titleKey: null,
    primaryKey: 's.guide.primary-play',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S06',
    frame: 6,
    name: 'Single-script view',
    slug: 'script',
    path: '/script',
    titleKey: null,
    primaryKey: 's.script.primary-continue',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S07',
    frame: 7,
    name: 'Overview',
    slug: 'overview',
    path: '/overview',
    titleKey: null,
    primaryKey: 's.overview.primary-go',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S08',
    frame: 8,
    name: 'Scripture reader',
    slug: 'scripture',
    path: '/scripture',
    titleKey: null,
    primaryKey: 's.scripture.primary-play',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S09',
    frame: 9,
    name: 'Resources catalog',
    slug: 'resources',
    path: '/resources',
    titleKey: 's.resources.title',
    primaryKey: null,
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S10',
    frame: 10,
    name: 'Key term detail',
    slug: 'term',
    path: '/term',
    titleKey: null,
    primaryKey: 's.term.primary-play',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S11',
    frame: 11,
    name: 'Image / map viewer',
    slug: 'viewer',
    path: '/viewer',
    titleKey: null,
    primaryKey: 's.viewer.primary-close-unit',
    dock: false,
    kind: 'screen',
  },
  {
    id: 'S12',
    frame: 12,
    name: 'Video player',
    slug: 'video',
    path: '/video',
    titleKey: null,
    primaryKey: 's.video.primary-play',
    dock: false,
    kind: 'screen',
  },
  {
    id: 'S13',
    frame: 13,
    name: 'Downloads / Offline',
    slug: 'downloads',
    path: '/downloads',
    titleKey: 's.downloads.title',
    primaryKey: 's.downloads.primary.save-passage',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S14',
    frame: 14,
    name: 'Settings',
    slug: 'settings',
    path: '/settings',
    titleKey: 's.settings.title',
    primaryKey: 's.settings.primary.done',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S15',
    frame: 15,
    name: 'About / Rights',
    slug: 'about',
    path: '/about',
    titleKey: 's.about.title',
    primaryKey: null,
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S16',
    frame: 16,
    name: 'Feedback',
    slug: 'feedback',
    path: '/feedback',
    titleKey: 's.feedback.title',
    primaryKey: 's.feedback.primary.send',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S17',
    frame: 17,
    name: 'Install guide',
    slug: 'install',
    path: '/install',
    titleKey: 's.install.title',
    primaryKey: 's.install.primary.next',
    dock: false,
    kind: 'screen',
  },
  {
    id: 'S18',
    frame: 18,
    name: 'Completion',
    slug: 'completion',
    path: '/done',
    titleKey: 's.completion.headline',
    primaryKey: 's.completion.primary.start-again',
    dock: true,
    kind: 'screen',
  },
  {
    id: 'S19',
    frame: 19,
    name: 'Coverage',
    slug: 'coverage',
    path: '/coverage',
    titleKey: 's.coverage.title',
    primaryKey: null,
    dock: true,
    kind: 'screen',
  },
  {
    id: 'SH-1',
    frame: 20,
    name: 'Sheet · Provenance info',
    slug: 'prov',
    path: '/sheet/provenance',
    titleKey: 's.prov.title.ai-voice',
    primaryKey: 's.prov.primary.close',
    dock: false,
    kind: 'sheet',
  },
  {
    id: 'SH-2',
    frame: 21,
    name: 'Sheet · Discussion-stop',
    slug: 'stop',
    path: '/sheet/stop',
    titleKey: 's.stop.title',
    primaryKey: 's.stop.primary.continue',
    dock: false,
    kind: 'sheet',
  },
  {
    id: 'SH-3',
    frame: 22,
    name: 'Sheet · Update notice',
    slug: 'update',
    path: '/sheet/update',
    titleKey: 's.update.title.app',
    primaryKey: 's.update.primary.update',
    dock: false,
    kind: 'sheet',
  },
  {
    id: 'SH-4',
    frame: 23,
    name: 'Sheet · Storage warning',
    slug: 'storage',
    path: '/sheet/storage',
    titleKey: 's.storage.title.space',
    primaryKey: 's.storage.primary.manage',
    dock: false,
    kind: 'sheet',
  },
  {
    id: 'SH-5',
    frame: 24,
    name: 'Sheet · Forward-jump guard',
    slug: 'jump',
    path: '/sheet/jump',
    titleKey: 's.jump.title.one',
    primaryKey: 's.jump.primary.one',
    dock: false,
    kind: 'sheet',
  },
];

export const screenById = (id: ScreenId): ScreenDef => {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown screen ${id}`);
  return s;
};
