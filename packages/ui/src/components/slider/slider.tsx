import {
  Slider as SdkSlider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider";
import type { NumberFormat } from "@ui-sdk/react/slider";
import { useId } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** `Intl.NumberFormat` options for the shown value, e.g. percent or degrees. */
  format?: NumberFormat;
  locale?: string;
  onValueChange: (value: number) => void;
}

/** One labelled value on a scale: volume, sensitivity, field of view. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  locale,
  onValueChange,
}: SliderProps) {
  const labelId = useId();
  return (
    <SdkSlider
      value={value}
      min={min}
      max={max}
      step={step}
      format={format}
      locale={locale}
      onValueChange={onValueChange}
      className="grid gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span id={labelId}>{label}</span>
        <SliderValue className="text-white/70 tabular-nums" />
      </div>
      <SliderControl className="flex h-6 cursor-pointer touch-none items-center">
        <SliderTrack className="relative h-1.5 w-full rounded-full bg-white/15">
          <SliderIndicator className="rounded-full bg-amber-400" />
          <SliderThumb
            aria-labelledby={labelId}
            className="top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-amber-300 ring-offset-2 ring-offset-neutral-900 has-[:focus-visible]:ring-2 data-dragging:scale-110"
          />
        </SliderTrack>
      </SliderControl>
    </SdkSlider>
  );
}
