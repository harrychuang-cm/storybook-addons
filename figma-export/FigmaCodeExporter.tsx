import {
  CheckIcon,
  CommandIcon,
  CopyIcon,
  FigmaIcon,
} from "@storybook/icons";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { createFigmaExportPayload } from "./domExport";
import "./figma-code-exporter.css";
import {
  isStoryIncludedForFigmaExport,
  resolveFigmaExportAddonOptions,
  type FigmaExportAddonOptions,
} from "./options";
import { createFigmaExportJson, createFigmaPluginCode } from "./pluginCode";

type StorybookContext = {
  globals?: Record<string, unknown>;
  id?: string;
  name?: string;
  title?: string;
};

type FigmaCodeExporterProps = {
  children?: ReactNode;
  context: StorybookContext;
  options?: FigmaExportAddonOptions;
};

type CopyFormat = "json" | "script";
type ExportStatus = "copied" | "copying" | "error" | "idle";

const statusLabels: Record<ExportStatus, string> = {
  copied: "Copied",
  copying: "Exporting",
  error: "Failed",
  idle: "Ready",
};

function getExportComponentTitle(
  title: string | undefined,
  options: ReturnType<typeof resolveFigmaExportAddonOptions>,
): string {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;

  const matchingPrefix = options.storyTitlePrefix.find((prefix) =>
    title.startsWith(prefix),
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

export function FigmaCodeExporter({
  children,
  context,
  options,
}: FigmaCodeExporterProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const [activeFormat, setActiveFormat] = useState<CopyFormat | undefined>();
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | undefined>();
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [summary, setSummary] = useState("");

  const resolvedOptions = resolveFigmaExportAddonOptions(options);
  const enabled = context.globals?.[resolvedOptions.globalName] === "on";
  const includedStory = isStoryIncludedForFigmaExport(context.title, resolvedOptions);
  const componentTitle = getExportComponentTitle(context.title, resolvedOptions);

  async function handleCopy(format: CopyFormat) {
    const scope = scopeRef.current;
    if (!scope) return;

    setActiveFormat(format);
    setCopiedFormat(undefined);
    setStatus("copying");
    setSummary(format === "json" ? "Generating JSON payload..." : "Generating console script...");

    try {
      const payload = await createFigmaExportPayload({
        componentTitle,
        options: resolvedOptions,
        scope,
        storyId: context.id ?? "unknown-story",
        storyName: context.name ?? "Story",
      });
      const exportText =
        format === "json"
          ? createFigmaExportJson(payload)
          : createFigmaPluginCode(payload);
      await copyText(exportText);
      setCopiedFormat(format);
      setStatus("copied");
      setSummary(
        `${payload.tokens.length} variables exported from ${payload.root.name}`,
      );
    } catch (error) {
      setStatus("error");
      setCopiedFormat(undefined);
      setSummary(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setActiveFormat(undefined);
    }
  }

  if (!includedStory) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="sbfx-story-scope" ref={scopeRef}>
        {children}
      </div>
      {enabled ? (
        <aside
          aria-label="Figma export"
          className="sbfx-exporter"
          data-status={status}
        >
          <header className="sbfx-exporter__header">
            <span className="sbfx-exporter__mark" aria-hidden="true">
              <FigmaIcon size={14} />
            </span>
            <span className="sbfx-exporter__heading">
              <span className="sbfx-exporter__title">Figma export</span>
              <span className="sbfx-exporter__subtitle" title={componentTitle}>
                {componentTitle}
              </span>
            </span>
          </header>
          <div className="sbfx-exporter__info">
            <span className="sbfx-exporter__status">
              <span className="sbfx-exporter__status-dot" aria-hidden="true" />
              {statusLabels[status]}
            </span>
            {summary ? (
              <p className="sbfx-exporter__summary" title={summary}>
                {summary}
              </p>
            ) : null}
          </div>
          <div className="sbfx-exporter__actions">
            <button
              className="sbfx-exporter__button"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("json");
              }}
              type="button"
            >
              {copiedFormat === "json" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <CopyIcon size={14} />
              )}
              {activeFormat === "json"
                ? "Copying"
                : copiedFormat === "json" && status === "copied"
                  ? "Copied"
                  : "Copy JSON"}
            </button>
            <button
              className="sbfx-exporter__button sbfx-exporter__button--secondary"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("script");
              }}
              type="button"
            >
              {copiedFormat === "script" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <CommandIcon size={14} />
              )}
              {activeFormat === "script"
                ? "Copying"
                : copiedFormat === "script" && status === "copied"
                  ? "Copied"
                  : "Console Script"}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
