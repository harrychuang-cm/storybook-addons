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
var registerPrototypeInspectorPanel = registerPrototypeInspectorTool;

// src/preview.tsx
import {
  Background,
  Controls,
  ReactFlow
} from "@xyflow/react";
import { createElement as createElement2, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
var prototypeInspectorStylesheetId = "storybook-prototype-inspector-styles";
var prototypeInspectorStylesheetHref = new URL(
  "./prototype-inspector.css",
  import.meta.url
).href;
var resizeObserverLoopMessage2 = "ResizeObserver loop completed with undelivered notifications";
var docTabs = [
  { docKey: "prd", id: "prd", label: "PRD" },
  { docKey: "uiSpec", id: "ui-spec", label: "UI Spec" },
  { docKey: "flowSpec", id: "flow-spec", label: "Flow Spec" },
  { docKey: "dataSpec", id: "data-spec", label: "Data Spec" },
  { docKey: "acceptance", id: "acceptance", label: "Acceptance" }
];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPrototypeFlow(value) {
  return isRecord(value) && Array.isArray(value.routes) && Array.isArray(value.transitions);
}
function normalizePrototypeParameter(value) {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  return {
    data: value.data,
    description: typeof value.description === "string" ? value.description : void 0,
    docs: isRecord(value.docs) ? value.docs : void 0,
    flow: isPrototypeFlow(value.flow) ? value.flow : void 0,
    id: value.id,
    owner: typeof value.owner === "string" ? value.owner : void 0,
    status: typeof value.status === "string" ? value.status : void 0,
    title: typeof value.title === "string" ? value.title : value.id
  };
}
function getPrototypeMode2(value) {
  return prototypeInspectorModes.some((mode) => mode.id === value) ? value : "story";
}
function getPrototypeParameter(context, parameterName) {
  return normalizePrototypeParameter(context.parameters?.[parameterName]);
}
function installResizeObserverLoopGuard2() {
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
      if (typeof event.message === "string" && event.message.includes(resizeObserverLoopMessage2)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}
installResizeObserverLoopGuard2();
function parseMarkdown(markdown) {
  const blocks = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph = [];
  let list = [];
  let code = null;
  let codeLanguage;
  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({
        text: paragraph.join(" "),
        type: "paragraph"
      });
      paragraph = [];
    }
  }
  function flushList() {
    if (list.length > 0) {
      blocks.push({
        items: list,
        type: "list"
      });
      list = [];
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (code) {
        blocks.push({
          language: codeLanguage,
          text: code.join("\n"),
          type: "code"
        });
        code = null;
        codeLanguage = void 0;
      } else {
        flushParagraph();
        flushList();
        code = [];
        codeLanguage = trimmed.slice(3).trim() || void 0;
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (trimmed.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        level: headingMatch[1].length,
        text: headingMatch[2],
        type: "heading"
      });
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushParagraph();
      list.push(trimmed.slice(2));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  if (code) {
    blocks.push({
      language: codeLanguage,
      text: code.join("\n"),
      type: "code"
    });
  }
  return blocks;
}
function MarkdownDocument({ value }) {
  const blocks = useMemo(() => parseMarkdown(value), [value]);
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__document" }, blocks.map((block, index) => {
    const key = `${block.type}-${index}`;
    if (block.type === "heading") {
      const HeadingTag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
      return /* @__PURE__ */ createElement2(HeadingTag, { key }, block.text);
    }
    if (block.type === "list") {
      return /* @__PURE__ */ createElement2("ul", { key }, block.items.map((item, itemIndex) => /* @__PURE__ */ createElement2("li", { key: `${key}-${itemIndex}` }, item)));
    }
    if (block.type === "code") {
      return /* @__PURE__ */ createElement2("pre", { key, className: "prototype-inspector__code" }, block.language ? `${block.language}
` : "", block.text);
    }
    return /* @__PURE__ */ createElement2("p", { key }, block.text);
  }));
}
function RouteTable({
  routes
}) {
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__table-wrap" }, /* @__PURE__ */ createElement2("table", { className: "prototype-inspector__table" }, /* @__PURE__ */ createElement2("thead", null, /* @__PURE__ */ createElement2("tr", null, /* @__PURE__ */ createElement2("th", null, "Route"), /* @__PURE__ */ createElement2("th", null, "Title"), /* @__PURE__ */ createElement2("th", null, "Navigation"), /* @__PURE__ */ createElement2("th", null, "Component"))), /* @__PURE__ */ createElement2("tbody", null, routes.map((route) => /* @__PURE__ */ createElement2("tr", { key: route.id }, /* @__PURE__ */ createElement2("td", null, route.id), /* @__PURE__ */ createElement2("td", null, route.title ?? route.id), /* @__PURE__ */ createElement2("td", null, route.navigationId ?? "-"), /* @__PURE__ */ createElement2("td", null, route.component ?? "-"))))));
}
function PrototypeDocuments({
  prototype
}) {
  const tabs = docTabs.filter((tab) => {
    const value = prototype.docs?.[tab.docKey];
    return typeof value === "string" && value.trim().length > 0;
  });
  const [selectedTab, setSelectedTab] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.some((tab) => tab.id === selectedTab) ? selectedTab : tabs[0]?.id ?? "";
  const activeDocTab = tabs.find((tab) => tab.id === activeTab);
  const activeDoc = activeDocTab ? prototype.docs?.[activeDocTab.docKey] : void 0;
  if (!activeDoc) {
    return /* @__PURE__ */ createElement2(EmptyState, { message: "No prototype documents found." });
  }
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector prototype-inspector--canvas" }, /* @__PURE__ */ createElement2("header", { className: "prototype-inspector__canvas-header" }, /* @__PURE__ */ createElement2("p", { className: "prototype-inspector__eyebrow" }, prototype.id), /* @__PURE__ */ createElement2("h2", null, prototype.title)), /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__tabs", role: "tablist" }, tabs.map((tab) => /* @__PURE__ */ createElement2(
    "button",
    {
      "aria-selected": activeTab === tab.id,
      className: "prototype-inspector__tab",
      key: tab.id,
      onClick: () => setSelectedTab(tab.id),
      role: "tab",
      type: "button"
    },
    tab.label
  ))), /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__body" }, /* @__PURE__ */ createElement2(MarkdownDocument, { value: activeDoc })));
}
function getRoutePosition(index) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: column * 300,
    y: row * 180
  };
}
function getTransitionId(transition, index) {
  return transition.id ?? `${transition.from}-${transition.to}-${transition.trigger ?? index}`;
}
function PrototypeFlowView({ flow }) {
  const nodes = useMemo(
    () => flow.routes.map((route, index) => ({
      data: {
        label: /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__flow-node" }, /* @__PURE__ */ createElement2("strong", null, route.title ?? route.id), /* @__PURE__ */ createElement2("span", null, route.id), route.navigationId ? /* @__PURE__ */ createElement2("small", null, route.navigationId) : null)
      },
      id: route.id,
      position: getRoutePosition(index)
    })),
    [flow.routes]
  );
  const routeIds = useMemo(
    () => new Set(flow.routes.map((route) => route.id)),
    [flow.routes]
  );
  const edges = useMemo(
    () => flow.transitions.filter(
      (transition) => routeIds.has(transition.from) && routeIds.has(transition.to)
    ).map((transition, index) => ({
      animated: false,
      id: getTransitionId(transition, index),
      label: transition.label ?? transition.trigger,
      source: transition.from,
      target: transition.to
    })),
    [flow.transitions, routeIds]
  );
  return /* @__PURE__ */ createElement2(
    "div",
    {
      className: "prototype-inspector__flow",
      style: { height: "100vh", minHeight: "28rem", width: "100%" }
    },
    /* @__PURE__ */ createElement2(
      ReactFlow,
      {
        edges,
        fitView: true,
        nodes,
        nodesConnectable: false,
        nodesDraggable: false
      },
      /* @__PURE__ */ createElement2(Background, null),
      /* @__PURE__ */ createElement2(Controls, { showInteractive: false })
    )
  );
}
function PrototypeFlowCanvas({
  prototype
}) {
  if (!prototype.flow) {
    return /* @__PURE__ */ createElement2(EmptyState, { message: "No UI flow found for this prototype." });
  }
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector prototype-inspector--canvas prototype-inspector--flow-mode" }, /* @__PURE__ */ createElement2(PrototypeFlowView, { flow: prototype.flow }));
}
function PrototypeDataCanvas({
  prototype
}) {
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector prototype-inspector--canvas" }, /* @__PURE__ */ createElement2("header", { className: "prototype-inspector__canvas-header" }, /* @__PURE__ */ createElement2("p", { className: "prototype-inspector__eyebrow" }, prototype.id), /* @__PURE__ */ createElement2("h2", null, "Prototype Data")), /* @__PURE__ */ createElement2("div", { className: "prototype-inspector__body" }, prototype.flow ? /* @__PURE__ */ createElement2(RouteTable, { routes: prototype.flow.routes }) : null, /* @__PURE__ */ createElement2("pre", { className: "prototype-inspector__code" }, JSON.stringify(prototype.data ?? prototype, null, 2))));
}
function EmptyState({ message }) {
  return /* @__PURE__ */ createElement2("div", { className: "prototype-inspector prototype-inspector--canvas prototype-inspector--empty" }, /* @__PURE__ */ createElement2("p", { className: "prototype-inspector__empty" }, message));
}
function loadPrototypeInspectorStyles() {
  if (typeof document === "undefined") {
    return;
  }
  const existingStylesheet = document.getElementById(
    prototypeInspectorStylesheetId
  );
  if (existingStylesheet) {
    return;
  }
  const stylesheet = document.createElement("link");
  stylesheet.id = prototypeInspectorStylesheetId;
  stylesheet.rel = "stylesheet";
  stylesheet.href = prototypeInspectorStylesheetHref;
  document.head.appendChild(stylesheet);
}
function getPrototypeInspectorGlobalName(options) {
  return options?.globalName ?? defaultPrototypeModeGlobalName;
}
function createPrototypeInspectorDecorator(options) {
  const globalName = getPrototypeInspectorGlobalName(options);
  const parameterName = options?.parameterName ?? "prototype";
  return (Story, context) => {
    installResizeObserverLoopGuard2();
    loadPrototypeInspectorStyles();
    const mode = getPrototypeMode2(context.globals?.[globalName]);
    const prototype = getPrototypeParameter(context, parameterName);
    if (mode === "story" || !prototype) {
      return Story();
    }
    if (mode === "docs") {
      return /* @__PURE__ */ createElement2(PrototypeDocuments, { prototype });
    }
    if (mode === "flow") {
      return /* @__PURE__ */ createElement2(PrototypeFlowCanvas, { prototype });
    }
    return /* @__PURE__ */ createElement2(PrototypeDataCanvas, { prototype });
  };
}
function createPrototypeInspectorGlobalTypes(options) {
  return {
    [getPrototypeInspectorGlobalName(options)]: {
      defaultValue: "story",
      description: "Controls the Prototype toolbar canvas mode."
    }
  };
}
function createPrototypeInspectorInitialGlobals(options) {
  return {
    [getPrototypeInspectorGlobalName(options)]: "story"
  };
}
var decorators = [createPrototypeInspectorDecorator()];
var globalTypes = createPrototypeInspectorGlobalTypes();
var initialGlobals = createPrototypeInspectorInitialGlobals();
export {
  createPrototypeInspectorDecorator,
  createPrototypeInspectorGlobalTypes,
  createPrototypeInspectorInitialGlobals,
  defaultPrototypeParameterName,
  getPrototypeInspectorGlobalName,
  loadPrototypeInspectorStyles,
  prototypeInspectorAddonId,
  registerPrototypeInspectorPanel,
  registerPrototypeInspectorTool
};
//# sourceMappingURL=index.js.map