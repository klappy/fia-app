import type { ComponentType } from 'react';
import type { ScreenId } from './registry';
import S01FirstRunLanguage from './S01FirstRunLanguage';
import S02Library from './S02Library';
import S03PericopeList from './S03PericopeList';
import S04PassageCard from './S04PassageCard';
import S05Guide from './S05Guide';
import S06SingleScript from './S06SingleScript';
import S07Overview from './S07Overview';
import S08ScriptureReader from './S08ScriptureReader';
import S09ResourcesCatalog from './S09ResourcesCatalog';
import S10KeyTermDetail from './S10KeyTermDetail';
import S11ImageMapViewer from './S11ImageMapViewer';
import S12VideoPlayer from './S12VideoPlayer';
import S13DownloadsOffline from './S13DownloadsOffline';
import S14Settings from './S14Settings';
import S15AboutRights from './S15AboutRights';
import S16Feedback from './S16Feedback';
import S17InstallGuide from './S17InstallGuide';
import S18Completion from './S18Completion';
import S19Coverage from './S19Coverage';
import SH1ProvenanceInfo from './SH1ProvenanceInfo';
import SH2DiscussionStop from './SH2DiscussionStop';
import SH3UpdateNotice from './SH3UpdateNotice';
import SH4StorageWarning from './SH4StorageWarning';
import SH5ForwardJumpGuard from './SH5ForwardJumpGuard';

export { SCREENS, screenById } from './registry';
export type { ScreenDef, ScreenId } from './registry';

export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType> = {
  S01: S01FirstRunLanguage,
  S02: S02Library,
  S03: S03PericopeList,
  S04: S04PassageCard,
  S05: S05Guide,
  S06: S06SingleScript,
  S07: S07Overview,
  S08: S08ScriptureReader,
  S09: S09ResourcesCatalog,
  S10: S10KeyTermDetail,
  S11: S11ImageMapViewer,
  S12: S12VideoPlayer,
  S13: S13DownloadsOffline,
  S14: S14Settings,
  S15: S15AboutRights,
  S16: S16Feedback,
  S17: S17InstallGuide,
  S18: S18Completion,
  S19: S19Coverage,
  'SH-1': SH1ProvenanceInfo,
  'SH-2': SH2DiscussionStop,
  'SH-3': SH3UpdateNotice,
  'SH-4': SH4StorageWarning,
  'SH-5': SH5ForwardJumpGuard,
};
