import { ChevronDownIcon, DocumentIcon } from "@storybook/icons";
import { createElement, type SyntheticEvent } from "react";
import {
  ToggleButton,
  TooltipLinkList,
  WithTooltip,
} from "storybook/internal/components";
import { addons, types, useGlobals } from "storybook/manager-api";

import {
  defaultPrototypeModeGlobalName,
  prototypeInspectorModes,
  type PrototypeInspectorMode,
  type PrototypeInspectorOptions,
} from "./types";

export const prototypeInspectorAddonId = "storybook/prototype-inspector";
export const defaultPrototypeParameterName = "prototype";
const resizeObserverLoopMessage =
  "ResizeObserver loop completed with undelivered notifications";

type PrototypeInspectorToolbarProps = {
  options: Required<PrototypeInspectorOptions>;
};

function installResizeObserverLoopGuard() {
  if (typeof window === "undefined") {
    return;
  }

  const marker = "__prototypeInspectorResizeObserverLoopGuard";
  const guardedWindow = window as typeof window & Record<string, boolean>;
  if (guardedWindow[marker]) {
    return;
  }

  guardedWindow[marker] = true;
  window.addEventListener(
    "error",
    (event) => {
      if (
        typeof event.message === "string" &&
        event.message.includes(resizeObserverLoopMessage)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

installResizeObserverLoopGuard();

function getPrototypeMode(value: unknown): PrototypeInspectorMode {
  return prototypeInspectorModes.some((mode) => mode.id === value)
    ? (value as PrototypeInspectorMode)
    : "story";
}

function PrototypeInspectorToolbar({ options }: PrototypeInspectorToolbarProps) {
  const [globals, updateGlobals] = useGlobals();
  const selectedMode = getPrototypeMode(globals[options.globalName]);
  const selectedModeDefinition =
    prototypeInspectorModes.find((mode) => mode.id === selectedMode) ??
    prototypeInspectorModes[0];
  const title = `${options.toolTitle}: ${selectedModeDefinition.label}`;

  return createElement(
    WithTooltip,
    {
      closeOnOutsideClick: true,
      hasChrome: true,
      placement: "bottom",
      tooltip: ({ onHide }) =>
        createElement(TooltipLinkList, {
          links: prototypeInspectorModes.map((mode) => ({
            active: selectedMode === mode.id,
            id: mode.id,
            onClick: (event: SyntheticEvent) => {
              event.preventDefault();
              updateGlobals({
                [options.globalName]: mode.id,
              });
              onHide();
            },
            title: mode.label,
          })),
        }),
      trigger: "click",
      children: createElement(
        ToggleButton,
        {
          ariaLabel: title,
          key: `${options.addonId}/tool-button`,
          padding: "small",
          pressed: selectedMode !== "story",
          title,
          tooltip: title,
          variant: "ghost",
        },
        createElement(DocumentIcon),
        createElement("span", null, selectedModeDefinition.label),
        createElement(ChevronDownIcon),
      ),
    },
  );
}

export function registerPrototypeInspectorTool(
  options: PrototypeInspectorOptions = {},
) {
  const resolvedOptions: Required<PrototypeInspectorOptions> = {
    addonId: options.addonId ?? prototypeInspectorAddonId,
    globalName: options.globalName ?? defaultPrototypeModeGlobalName,
    parameterName: options.parameterName ?? defaultPrototypeParameterName,
    toolTitle: options.toolTitle ?? "Prototype",
  };
  const toolId = `${resolvedOptions.addonId}/tool`;

  addons.register(resolvedOptions.addonId, () => {
    addons.add(toolId, {
      render: () =>
        createElement(PrototypeInspectorToolbar, {
          options: resolvedOptions,
        }),
      title: resolvedOptions.toolTitle,
      type: types.TOOL,
    });
  });
}

export const registerPrototypeInspectorPanel = registerPrototypeInspectorTool;
