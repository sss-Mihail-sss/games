import {
  Tabs as SdkTabs,
  TabsList as SdkTabsList,
  TabsPanel as SdkTabsPanel,
  TabsTab as SdkTabsTab,
} from "@ui-sdk/react/tabs";
import type { ComponentProps } from "react";

/** The ui-sdk tabs with the game UI's look; the parts compose as usual. */
export const Tabs = SdkTabs;

export function TabsList(
  props: Omit<ComponentProps<typeof SdkTabsList>, "className">,
) {
  return (
    <SdkTabsList className="flex gap-1 border-b border-white/15" {...props} />
  );
}

export function TabsTab(
  props: Omit<ComponentProps<typeof SdkTabsTab>, "className">,
) {
  return (
    <SdkTabsTab
      className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-white/70 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300 data-selected:border-amber-400 data-selected:text-white"
      {...props}
    />
  );
}

export function TabsPanel(
  props: Omit<ComponentProps<typeof SdkTabsPanel>, "className">,
) {
  return <SdkTabsPanel className="pt-4 outline-none" {...props} />;
}
