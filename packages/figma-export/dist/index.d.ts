import * as react from 'react';
import { ReactNode } from 'react';
import { F as FigmaExportAddonOptions, a as FigmaExportPayload } from './preview-BH_VlNlD.js';
export { b as FigmaBindingName, c as FigmaExportNode, d as FigmaExportToken, e as FigmaLayoutStrategy, f as FigmaNodeKind, R as ResolvedFigmaExportAddonOptions, T as TokenLayer, g as createFigmaExportDecorator, h as createFigmaExportGlobalTypes, i as createFigmaExportInitialGlobals, j as defaultFigmaExportGlobalName, k as getFigmaExportGlobalName, l as isStoryIncludedForFigmaExport, r as resolveFigmaExportAddonOptions } from './preview-BH_VlNlD.js';

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
declare function FigmaCodeExporter({ children, context, options, }: FigmaCodeExporterProps): react.JSX.Element;

type FigmaExportToolOptions = {
    addonId?: string;
    globalName?: string;
};
declare const figmaExportAddonId = "storybook/figma-export";
declare function registerFigmaExportTool(options?: FigmaExportToolOptions): void;

declare function createFigmaExportJson(payload: FigmaExportPayload): string;
declare function createFigmaPluginCode(payload: FigmaExportPayload): string;

export { FigmaCodeExporter, FigmaExportAddonOptions, FigmaExportPayload, createFigmaExportJson, createFigmaPluginCode, figmaExportAddonId, registerFigmaExportTool };
