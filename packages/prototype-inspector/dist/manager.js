// src/manager.tsx
import { ChevronDownIcon, DocumentIcon } from "@storybook/icons";
import { createElement } from "react";
import {
  ToggleButton,
  TooltipLinkList,
  WithTooltip
} from "storybook/internal/components";
import { addons, types, useGlobals } from "storybook/manager-api";

// src/types.ts
var prototypeInspectorModes = [
  { id: "story", label: "Story" },
  { id: "docs", label: "Docs" },
  { id: "flow", label: "UI Flow" },
  { id: "data", label: "Data" }
];
var defaultPrototypeModeGlobalName = "prototypeMode";

// src/manager.tsx
var prototypeInspectorAddonId = "storybook/prototype-inspector";
var defaultPrototypeParameterName = "prototype";
var resizeObserverLoopMessage = "ResizeObserver loop completed with undelivered notifications";
function installResizeObserverLoopGuard() {
  if (typeof window === "undefined") {
    return;
  }
  const marker = "__prototypeInspectorResizeObserverLoopGuard";
  const guardedWindow = window;
  if (guardedWindow[marker]) {
    return;
  }
  guardedWindow[marker] = true;
  window.addEventListener(
    "error",
    (event) => {
      if (typeof event.message === "string" && event.message.includes(resizeObserverLoopMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}
installResizeObserverLoopGuard();
function getPrototypeMode(value) {
  return prototypeInspectorModes.some((mode) => mode.id === value) ? value : "story";
}
function PrototypeInspectorToolbar({ options }) {
  const [globals, updateGlobals] = useGlobals();
  const selectedMode = getPrototypeMode(globals[options.globalName]);
  const selectedModeDefinition = prototypeInspectorModes.find((mode) => mode.id === selectedMode) ?? prototypeInspectorModes[0];
  const title = `${options.toolTitle}: ${selectedModeDefinition.label}`;
  return createElement(
    WithTooltip,
    {
      closeOnOutsideClick: true,
      hasChrome: true,
      placement: "bottom",
      tooltip: ({ onHide }) => createElement(TooltipLinkList, {
        links: prototypeInspectorModes.map((mode) => ({
          active: selectedMode === mode.id,
          id: mode.id,
          onClick: (event) => {
            event.preventDefault();
            updateGlobals({
              [options.globalName]: mode.id
            });
            onHide();
          },
          title: mode.label
        }))
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
          variant: "ghost"
        },
        createElement(DocumentIcon),
        createElement("span", null, selectedModeDefinition.label),
        createElement(ChevronDownIcon)
      )
    }
  );
}
function registerPrototypeInspectorTool(options = {}) {
  const resolvedOptions = {
    addonId: options.addonId ?? prototypeInspectorAddonId,
    globalName: options.globalName ?? defaultPrototypeModeGlobalName,
    parameterName: options.parameterName ?? defaultPrototypeParameterName,
    toolTitle: options.toolTitle ?? "Prototype"
  };
  const toolId = `${resolvedOptions.addonId}/tool`;
  addons.register(resolvedOptions.addonId, () => {
    addons.add(toolId, {
      render: () => createElement(PrototypeInspectorToolbar, {
        options: resolvedOptions
      }),
      title: resolvedOptions.toolTitle,
      type: types.TOOL
    });
  });
}

// src/manager-entry.ts
registerPrototypeInspectorTool();
//# sourceMappingURL=manager.js.map