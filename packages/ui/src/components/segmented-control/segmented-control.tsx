import {
  SegmentedControl as SdkSegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onValueChange: (value: T) => void;
}

/** One of a few options side by side, like graphics quality. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span>{label}</span>
      <SdkSegmentedControl<T>
        aria-label={label}
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onValueChange(next);
          }
        }}
        className="relative inline-flex w-full rounded-lg bg-white/10 p-1"
      >
        {/* ui-sdk measures the checked item into CSS variables; we place the box by them. */}
        <SegmentedControlIndicator className="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-md bg-white/20 transition-all motion-reduce:transition-none" />
        {options.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            className="relative z-10 h-8 flex-1 rounded-md px-3 text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-amber-300 data-checked:text-white"
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SdkSegmentedControl>
    </div>
  );
}
