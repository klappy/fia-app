// BT Glass, vendored whole at klappy/bt-design-system-generative-glass @6aa9bc3 (src/vendor/glass/,
// FE-1; pin in src/vendor/glass/.vendored-sha). The kit is never edited: app overrides live in
// src/tokens/alpha.css. This file is the one import point the app uses, so a re-pin touches one place.
// React 19 import proof (F4): the kit's .jsx render through the app's React 19 build (vite, @vitejs/plugin-react).
import '../vendor/glass/styles.css';

import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { AuroraField as KitAuroraField } from '../vendor/glass/components/glass/AuroraField';
import type { AuroraFieldProps } from '../vendor/glass/components/glass/AuroraField';
import { GlassSurface as KitGlassSurface } from '../vendor/glass/components/glass/GlassSurface';
import type { GlassSurfaceProps } from '../vendor/glass/components/glass/GlassSurface';
import { GlassButton as KitGlassButton } from '../vendor/glass/components/glass/GlassButton';
import type { GlassButtonProps } from '../vendor/glass/components/glass/GlassButton';
import { GlassSheet as KitGlassSheet } from '../vendor/glass/components/navigation/GlassSheet';
import type { GlassSheetProps } from '../vendor/glass/components/navigation/GlassSheet';
import { CatalogRow as KitCatalogRow } from '../vendor/glass/components/resources/CatalogRow';
import { Icon as KitIcon } from '../vendor/glass/components/icons/Icon';

// Typing only: the kit's .d.ts (written for React 18's global JSX) omit the `...rest` the .jsx
// forward (className, aria-*, handlers). Same components, wider prop types; no behaviour added.
type Html = HTMLAttributes<HTMLElement> & { type?: 'button' | 'submit' | 'reset' };
export const AuroraField = KitAuroraField as unknown as ComponentType<AuroraFieldProps & Html>;
export const GlassSurface = KitGlassSurface as unknown as ComponentType<GlassSurfaceProps & Html>;
export const GlassButton = KitGlassButton as unknown as ComponentType<GlassButtonProps>;
export const GlassSheet = KitGlassSheet as unknown as ComponentType<
  Omit<GlassSheetProps, 'title'> & Html & { title?: string }
>;
export const CatalogRow = KitCatalogRow as unknown as ComponentType<
  Omit<Html, 'title'> & {
    title: ReactNode;
    subject?: string;
    meta?: ReactNode;
    first?: boolean;
    onOpen?: () => void;
  }
>;
export const Icon = KitIcon as unknown as ComponentType<{
  name: KitIconName;
  size?: number;
  stroke?: number;
  color?: string;
}>;

/** Kit icon names present in `components/icons/Icon.jsx` @6aa9bc3 (the .d.ts union omits the BT additions). */
export type KitIconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'bookmark'
  | 'compass'
  | 'sparkle'
  | 'book'
  | 'headphones'
  | 'check'
  | 'cloudOff'
  | 'globe'
  | 'languages'
  | 'x';
