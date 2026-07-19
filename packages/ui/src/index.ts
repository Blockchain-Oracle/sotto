/**
 * @sotto/ui — the Sotto Voce design system (DESIGN.md is binding).
 *
 * Consumers import three stylesheets alongside these components:
 *   @sotto/ui/theme.css       — tokens, themes, motion gates (only raw-hex file)
 *   @sotto/ui/primitives.css  — component classes (tokens only)
 *   @sotto/ui/fonts/fonts.css — self-hosted type voices (apps serve the woff2)
 */

export * from "./format.js";

export { SottoMark, type SottoMarkProps } from "./marks/sotto-mark.js";
export {
  DynamicMarking,
  type DynamicMarkingProps,
} from "./marks/dynamic-marking.js";
export { CantonMark, type CantonMarkProps } from "./marks/canton-mark.js";

export {
  SystemRail,
  orderRailEvents,
  resolveFreshSounds,
  type RailEvent,
  type SystemRailProps,
} from "./primitives/system-rail.js";
export {
  StateChip,
  StateChipPair,
  pairStateChips,
  type ChipPair,
  type ChipShape,
  type ChipState,
  type ChipTone,
  type DeliveryOutcome,
  type SettlementOutcome,
  type StateChipPairProps,
} from "./primitives/state-chip.js";
export { RestState, type RestStateProps } from "./primitives/rest-state.js";
export { Veil, type VeilProps } from "./primitives/veil.js";
export { Deadline, type DeadlineProps } from "./primitives/deadline.js";
export { Button, type ButtonProps } from "./primitives/button.js";
export { Field, type FieldProps } from "./primitives/field.js";
export {
  Input,
  Textarea,
  type InputProps,
  type TextareaProps,
} from "./primitives/input.js";
export {
  Select,
  type SelectOption,
  type SelectProps,
} from "./primitives/select.js";
export { Card, type CardProps } from "./primitives/card.js";
export { Badge, type BadgeProps } from "./primitives/badge.js";
export { Table, type TableProps } from "./primitives/table.js";
export { CodeBlock, type CodeBlockProps } from "./primitives/code-block.js";
export { CopyChip, type CopyChipProps } from "./primitives/copy-chip.js";
export { Dialog, type DialogProps } from "./primitives/dialog.js";
export { Tabs, type TabItem, type TabsProps } from "./primitives/tabs.js";
export {
  Tooltip,
  TooltipProvider,
  type TooltipProps,
} from "./primitives/tooltip.js";
export { Toaster } from "./primitives/toast.js";
export {
  dismissToast,
  getToasts,
  resetToasts,
  subscribeToasts,
  toast,
  type ToastInput,
  type ToastNotice,
} from "./primitives/toast-store.js";
export {
  Skeleton,
  SkeletonText,
  type SkeletonProps,
  type SkeletonTextProps,
} from "./primitives/skeleton.js";
export {
  SystemStrip,
  type SystemStripProps,
} from "./primitives/system-strip.js";
