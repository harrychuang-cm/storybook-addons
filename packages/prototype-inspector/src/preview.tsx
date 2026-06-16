import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { ReactNode } from "react";
import { createElement, useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";
import {
  defaultPrototypeModeGlobalName,
  prototypeInspectorModes,
  type PrototypeInspectorDocKey,
  type PrototypeInspectorDocs,
  type PrototypeInspectorFlow,
  type PrototypeInspectorMode,
  type PrototypeInspectorOptions,
  type PrototypeInspectorParameter,
  type PrototypeInspectorRoute,
  type PrototypeInspectorTransition,
} from "./types";

const prototypeInspectorStylesheetId = "storybook-prototype-inspector-styles";
const prototypeInspectorStylesheetHref = new URL(
  "./prototype-inspector.css",
  import.meta.url,
).href;
const resizeObserverLoopMessage =
  "ResizeObserver loop completed with undelivered notifications";

type StorybookContext = {
  globals?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

type StorybookStory = () => ReactNode;

type MarkdownBlock =
  | {
      type: "heading";
      level: number;
      text: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "code";
      language?: string;
      text: string;
    };

const docTabs: Array<{
  id: string;
  label: string;
  docKey: PrototypeInspectorDocKey;
}> = [
  { docKey: "prd", id: "prd", label: "PRD" },
  { docKey: "uiSpec", id: "ui-spec", label: "UI Spec" },
  { docKey: "flowSpec", id: "flow-spec", label: "Flow Spec" },
  { docKey: "dataSpec", id: "data-spec", label: "Data Spec" },
  { docKey: "acceptance", id: "acceptance", label: "Acceptance" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrototypeFlow(value: unknown): value is PrototypeInspectorFlow {
  return (
    isRecord(value) &&
    Array.isArray(value.routes) &&
    Array.isArray(value.transitions)
  );
}

function normalizePrototypeParameter(
  value: unknown,
): PrototypeInspectorParameter | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  return {
    data: value.data,
    description:
      typeof value.description === "string" ? value.description : undefined,
    docs: isRecord(value.docs)
      ? (value.docs as PrototypeInspectorDocs)
      : undefined,
    flow: isPrototypeFlow(value.flow) ? value.flow : undefined,
    id: value.id,
    owner: typeof value.owner === "string" ? value.owner : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    title: typeof value.title === "string" ? value.title : value.id,
  };
}

function getPrototypeMode(value: unknown): PrototypeInspectorMode {
  return prototypeInspectorModes.some((mode) => mode.id === value)
    ? (value as PrototypeInspectorMode)
    : "story";
}

function getPrototypeParameter(
  context: StorybookContext,
  parameterName: string,
): PrototypeInspectorParameter | null {
  return normalizePrototypeParameter(context.parameters?.[parameterName]);
}

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
      if (typeof event.message === "string" && event.message.includes(resizeObserverLoopMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

installResizeObserverLoopGuard();

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let codeLanguage: string | undefined;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({
        text: paragraph.join(" "),
        type: "paragraph",
      });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length > 0) {
      blocks.push({
        items: list,
        type: "list",
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
          type: "code",
        });
        code = null;
        codeLanguage = undefined;
      } else {
        flushParagraph();
        flushList();
        code = [];
        codeLanguage = trimmed.slice(3).trim() || undefined;
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
        type: "heading",
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
      type: "code",
    });
  }

  return blocks;
}

function MarkdownDocument({ value }: { value: string }) {
  const blocks = useMemo(() => parseMarkdown(value), [value]);

  return (
    <div className="prototype-inspector__document">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === "heading") {
          const HeadingTag =
            block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          return <HeadingTag key={key}>{block.text}</HeadingTag>;
        }

        if (block.type === "list") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "code") {
          return (
            <pre key={key} className="prototype-inspector__code">
              {block.language ? `${block.language}\n` : ""}
              {block.text}
            </pre>
          );
        }

        return <p key={key}>{block.text}</p>;
      })}
    </div>
  );
}

function RouteTable({
  routes,
}: {
  routes: readonly PrototypeInspectorRoute[];
}) {
  return (
    <div className="prototype-inspector__table-wrap">
      <table className="prototype-inspector__table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Title</th>
            <th>Navigation</th>
            <th>Component</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.id}>
              <td>{route.id}</td>
              <td>{route.title ?? route.id}</td>
              <td>{route.navigationId ?? "-"}</td>
              <td>{route.component ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrototypeDocuments({
  prototype,
}: {
  prototype: PrototypeInspectorParameter;
}) {
  const tabs = docTabs.filter((tab) => {
    const value = prototype.docs?.[tab.docKey];
    return typeof value === "string" && value.trim().length > 0;
  });
  const [selectedTab, setSelectedTab] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : (tabs[0]?.id ?? "");
  const activeDocTab = tabs.find((tab) => tab.id === activeTab);
  const activeDoc = activeDocTab
    ? prototype.docs?.[activeDocTab.docKey]
    : undefined;

  if (!activeDoc) {
    return <EmptyState message="No prototype documents found." />;
  }

  return (
    <div className="prototype-inspector prototype-inspector--canvas">
      <header className="prototype-inspector__canvas-header">
        <p className="prototype-inspector__eyebrow">{prototype.id}</p>
        <h2>{prototype.title}</h2>
      </header>

      <div className="prototype-inspector__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className="prototype-inspector__tab"
            key={tab.id}
            onClick={() => setSelectedTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="prototype-inspector__body">
        <MarkdownDocument value={activeDoc} />
      </div>
    </div>
  );
}

function getRoutePosition(index: number) {
  const column = index % 3;
  const row = Math.floor(index / 3);

  return {
    x: column * 300,
    y: row * 180,
  };
}

function getTransitionId(
  transition: PrototypeInspectorTransition,
  index: number,
) {
  return (
    transition.id ??
    `${transition.from}-${transition.to}-${transition.trigger ?? index}`
  );
}

function PrototypeFlowView({ flow }: { flow: PrototypeInspectorFlow }) {
  const nodes = useMemo<Node[]>(
    () =>
      flow.routes.map((route, index) => ({
        data: {
          label: (
            <div className="prototype-inspector__flow-node">
              <strong>{route.title ?? route.id}</strong>
              <span>{route.id}</span>
              {route.navigationId ? <small>{route.navigationId}</small> : null}
            </div>
          ),
        },
        id: route.id,
        position: getRoutePosition(index),
      })),
    [flow.routes],
  );

  const routeIds = useMemo(
    () => new Set(flow.routes.map((route) => route.id)),
    [flow.routes],
  );

  const edges = useMemo<Edge[]>(
    () =>
      flow.transitions
        .filter(
          (transition) =>
            routeIds.has(transition.from) && routeIds.has(transition.to),
        )
        .map((transition, index) => ({
          animated: false,
          id: getTransitionId(transition, index),
          label: transition.label ?? transition.trigger,
          source: transition.from,
          target: transition.to,
        })),
    [flow.transitions, routeIds],
  );

  return (
    <div
      className="prototype-inspector__flow"
      style={{ height: "100vh", minHeight: "28rem", width: "100%" }}
    >
      <ReactFlow
        edges={edges}
        fitView
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function PrototypeFlowCanvas({
  prototype,
}: {
  prototype: PrototypeInspectorParameter;
}) {
  if (!prototype.flow) {
    return <EmptyState message="No UI flow found for this prototype." />;
  }

  return (
    <div className="prototype-inspector prototype-inspector--canvas prototype-inspector--flow-mode">
      <PrototypeFlowView flow={prototype.flow} />
    </div>
  );
}

function PrototypeDataCanvas({
  prototype,
}: {
  prototype: PrototypeInspectorParameter;
}) {
  return (
    <div className="prototype-inspector prototype-inspector--canvas">
      <header className="prototype-inspector__canvas-header">
        <p className="prototype-inspector__eyebrow">{prototype.id}</p>
        <h2>Prototype Data</h2>
      </header>

      <div className="prototype-inspector__body">
        {prototype.flow ? <RouteTable routes={prototype.flow.routes} /> : null}
        <pre className="prototype-inspector__code">
          {JSON.stringify(prototype.data ?? prototype, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="prototype-inspector prototype-inspector--canvas prototype-inspector--empty">
      <p className="prototype-inspector__empty">{message}</p>
    </div>
  );
}

export function loadPrototypeInspectorStyles() {
  if (typeof document === "undefined") {
    return;
  }

  const existingStylesheet = document.getElementById(
    prototypeInspectorStylesheetId,
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

export function getPrototypeInspectorGlobalName(
  options?: PrototypeInspectorOptions,
): string {
  return options?.globalName ?? defaultPrototypeModeGlobalName;
}

export function createPrototypeInspectorDecorator(
  options?: PrototypeInspectorOptions,
) {
  const globalName = getPrototypeInspectorGlobalName(options);
  const parameterName = options?.parameterName ?? "prototype";

  return (Story: StorybookStory, context: StorybookContext) => {
    installResizeObserverLoopGuard();
    loadPrototypeInspectorStyles();

    const mode = getPrototypeMode(context.globals?.[globalName]);
    const prototype = getPrototypeParameter(context, parameterName);

    if (mode === "story" || !prototype) {
      return Story();
    }

    if (mode === "docs") {
      return <PrototypeDocuments prototype={prototype} />;
    }

    if (mode === "flow") {
      return <PrototypeFlowCanvas prototype={prototype} />;
    }

    return <PrototypeDataCanvas prototype={prototype} />;
  };
}

export function createPrototypeInspectorGlobalTypes(
  options?: PrototypeInspectorOptions,
): Record<string, { defaultValue: PrototypeInspectorMode; description: string }> {
  return {
    [getPrototypeInspectorGlobalName(options)]: {
      defaultValue: "story",
      description: "Controls the Prototype toolbar canvas mode.",
    },
  };
}

export function createPrototypeInspectorInitialGlobals(
  options?: PrototypeInspectorOptions,
): Record<string, PrototypeInspectorMode> {
  return {
    [getPrototypeInspectorGlobalName(options)]: "story",
  };
}

export const decorators = [createPrototypeInspectorDecorator()];
export const globalTypes = createPrototypeInspectorGlobalTypes();
export const initialGlobals = createPrototypeInspectorInitialGlobals();
