import { GlassButton, Icon, type KitIconName } from './glass';

// QuietAction (PRD § 3 secondary-action on the kit; mock `Quiet`, design/alpha-v2-screens/_frame.js):
// a quiet kit GlassButton with a leading kit Icon — never a filled button (rule 2). 48 px target
// (R-603); the label wraps at 200% / 310% instead of running past the card. Shared by S13 and
// sheets 22 / 23; any glass screen's in-card action can use it. Styled by the shared .fia-btn .fia-quiet
// in src/flow/ui/guide.css, the same classes as the mock `Quiet` and the other quiet call sites.
export interface QuietActionProps {
  icon: KitIconName;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

export function QuietAction({ icon, label, onPress, disabled, className }: QuietActionProps) {
  return (
    <GlassButton
      variant="quiet"
      className={['fia-btn fia-quiet', className].filter(Boolean).join(' ')}
      leading={<Icon name={icon} size={18} />}
      disabled={disabled}
      onClick={disabled ? undefined : onPress}
    >
      {label}
    </GlassButton>
  );
}
