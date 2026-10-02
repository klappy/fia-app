// BT Glass, vendored whole at klappy/bt-design-system-generative-glass @ad528f4 (src/vendor/glass/,
// FE-1; pin in src/vendor/glass/.vendored-sha). The kit is never edited: app overrides live in
// src/tokens/alpha.css. This file is the one import point the app uses, so a re-pin touches one place.
// React 19 import proof (F4): the kit's .jsx render through the app's React 19 build (vite, @vitejs/plugin-react).
import '../vendor/glass/styles.css';

import type {
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { AuroraField as KitAuroraField } from '../vendor/glass/components/glass/AuroraField';
import type { AuroraFieldProps } from '../vendor/glass/components/glass/AuroraField';
import { GlassSurface as KitGlassSurface } from '../vendor/glass/components/glass/GlassSurface';
import type { GlassSurfaceProps } from '../vendor/glass/components/glass/GlassSurface';
import { GlassButton as KitGlassButton } from '../vendor/glass/components/glass/GlassButton';
import type { GlassButtonProps } from '../vendor/glass/components/glass/GlassButton';
import { GlassSheet as KitGlassSheet } from '../vendor/glass/components/navigation/GlassSheet';
import type { GlassSheetProps } from '../vendor/glass/components/navigation/GlassSheet';
import { GlassSegmented as KitGlassSegmented } from '../vendor/glass/components/forms/GlassSegmented';
import { GlassToggle as KitGlassToggle } from '../vendor/glass/components/forms/GlassToggle';
import { CatalogRow as KitCatalogRow } from '../vendor/glass/components/resources/CatalogRow';
import { Icon as KitIcon } from '../vendor/glass/components/icons/Icon';
import type { IconName } from '../vendor/glass/components/icons/Icon';
import { FilterChips as KitFilterChips } from '../vendor/glass/components/forms/FilterChips';
import { GlassField as KitGlassField } from '../vendor/glass/components/forms/GlassField';

// Typing only: the kit's .d.ts (written for React 18's global JSX) omit the `...rest` the .jsx
// forward (className, aria-*, handlers). Same components, wider prop types; no behaviour added.
type Html = HTMLAttributes<HTMLElement> & { type?: 'button' | 'submit' | 'reset' };
export const AuroraField = KitAuroraField as unknown as ComponentType<AuroraFieldProps & Html>;
export const GlassSurface = KitGlassSurface as unknown as ComponentType<GlassSurfaceProps & Html>;
export const GlassButton = KitGlassButton as unknown as ComponentType<GlassButtonProps>;
export const GlassSheet = KitGlassSheet as unknown as ComponentType<
  Omit<GlassSheetProps, 'title'> & Omit<Html, 'title'> & { title?: ReactNode }
>;
/** forms/GlassSegmented: radiogroup of buttons; `label` may be a node (GlassSegmented.jsx:5). */
export const GlassSegmented = KitGlassSegmented as unknown as ComponentType<
  Omit<Html, 'onChange'> & {
    options: { value: string; label: ReactNode }[];
    value?: string;
    onChange?: (value: string) => void;
    size?: 'sm' | 'md';
    style?: CSSProperties;
  }
>;
/** forms/GlassToggle: role=switch button; `...rest` lands on the switch (GlassToggle.jsx:4). */
export const GlassToggle = KitGlassToggle as unknown as ComponentType<
  Omit<Html, 'onChange'> & {
    checked?: boolean;
    label?: string;
    onChange?: (checked: boolean) => void;
    style?: CSSProperties;
  }
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

// F6-S16: forms. The .jsx forward `...rest` (FilterChips → the row; GlassField → the <input>).
export const FilterChips = KitFilterChips as unknown as ComponentType<
  Omit<Html, 'onChange'> & {
    options: { value: string; label?: ReactNode }[];
    value: string[];
    onChange?: (next: string[]) => void;
    bleed?: boolean;
  }
>;
export const GlassField = KitGlassField as unknown as ComponentType<
  Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> & {
    label?: ReactNode;
    style?: CSSProperties;
  }
>;

/** Kit icon names: the kit's own `Icon.d.ts` union, which @ad528f4 lists all 41 glyphs in `Icon.jsx` (K1, kit #9). */
export type KitIconName = IconName;
