import { Switch as SdkSwitch, SwitchThumb } from "@ui-sdk/react/switch";

interface SwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** An on/off setting with its label; a click anywhere on the row toggles it. */
export function Switch({ label, checked, onCheckedChange }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
      {label}
      <SdkSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-white/20 p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 data-checked:bg-amber-400"
      >
        <SwitchThumb className="size-5 rounded-full bg-white shadow transition-transform data-checked:translate-x-5" />
      </SdkSwitch>
    </label>
  );
}
