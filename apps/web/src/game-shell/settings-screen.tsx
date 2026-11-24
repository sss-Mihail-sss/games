"use client";

import type { Controls, PlatformSettings } from "@repo/game-core";
import {
  Button,
  SegmentedControl,
  Slider,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@repo/ui";

import { browserSettings, FOV_RANGE } from "#platform/index.ts";
import type { BindingsStore } from "#platform/index.ts";

import { useSettings } from "./hooks.ts";
import { KeysTab } from "./keys-tab.tsx";
import { Panel } from "./menus.tsx";

const PERCENT = { style: "percent" } as const;

const QUALITY: readonly {
  value: PlatformSettings["quality"];
  label: string;
}[] = [
  { value: "low", label: "Низкое" },
  { value: "medium", label: "Среднее" },
  { value: "high", label: "Высокое" },
];

/** Sound, mouse and graphics: the same for every game, saved at once. */
function GeneralSettings() {
  const settings = useSettings();
  const { set } = browserSettings();
  // The URL sets the language, and there is one language so far: not shown.
  const locale = settings.locale;

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-white/60 uppercase">
          Звук
        </legend>
        <Slider
          label="Общая громкость"
          value={settings.volume.master}
          min={0}
          max={1}
          step={0.05}
          format={PERCENT}
          locale={locale}
          onValueChange={(master) => set({ volume: { master } })}
        />
        <Slider
          label="Музыка"
          value={settings.volume.music}
          min={0}
          max={1}
          step={0.05}
          format={PERCENT}
          locale={locale}
          onValueChange={(music) => set({ volume: { music } })}
        />
        <Slider
          label="Эффекты"
          value={settings.volume.sfx}
          min={0}
          max={1}
          step={0.05}
          format={PERCENT}
          locale={locale}
          onValueChange={(sfx) => set({ volume: { sfx } })}
        />
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-white/60 uppercase">
          Мышь
        </legend>
        <Slider
          label="Чувствительность"
          value={settings.mouse.sensitivity}
          min={0.1}
          max={5}
          step={0.1}
          format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
          locale={locale}
          onValueChange={(sensitivity) => set({ mouse: { sensitivity } })}
        />
        <Switch
          label="Инвертировать по вертикали"
          checked={settings.mouse.invertY}
          onCheckedChange={(invertY) => set({ mouse: { invertY } })}
        />
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-white/60 uppercase">
          Графика
        </legend>
        <SegmentedControl
          label="Качество"
          value={settings.quality}
          options={QUALITY}
          onValueChange={(quality) => set({ quality })}
        />
        <Slider
          label="Поле зрения"
          value={settings.fov}
          min={FOV_RANGE.min}
          max={FOV_RANGE.max}
          step={1}
          format={{ style: "unit", unit: "degree" }}
          locale={locale}
          onValueChange={(fov) => set({ fov })}
        />
        <Switch
          label="Меньше анимации"
          checked={settings.reducedMotion}
          onCheckedChange={(reducedMotion) => set({ reducedMotion })}
        />
      </fieldset>
    </div>
  );
}

/**
 * The one settings screen for every game. With a game's `controls` it gets a
 * "Keys" tab; in the catalog there is no game, so only the general settings.
 */
export function SettingsScreen({
  controls,
  bindings,
  onClose,
}: {
  controls?: Controls;
  bindings?: BindingsStore;
  onClose: () => void;
}) {
  const keys = controls && bindings ? { controls, bindings } : null;

  return (
    <Panel title="Настройки" wide focusSelf>
      {keys ? (
        <Tabs defaultValue="general">
          <TabsList aria-label="Разделы настроек">
            <TabsTab value="general">Общие</TabsTab>
            <TabsTab value="keys">Клавиши</TabsTab>
          </TabsList>
          <TabsPanel value="general">
            <GeneralSettings />
          </TabsPanel>
          <TabsPanel value="keys">
            <KeysTab controls={keys.controls} bindings={keys.bindings} />
          </TabsPanel>
        </Tabs>
      ) : (
        <GeneralSettings />
      )}
      <Button tone="primary" onClick={onClose}>
        Готово
      </Button>
    </Panel>
  );
}
