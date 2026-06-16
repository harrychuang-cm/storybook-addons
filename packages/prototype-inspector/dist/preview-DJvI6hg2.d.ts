import * as react from 'react';
import { ReactNode } from 'react';

type PrototypeInspectorDocKey = "prd" | "uiSpec" | "flowSpec" | "dataSpec" | "acceptance";
type PrototypeInspectorDocs = Partial<Record<PrototypeInspectorDocKey, string>> & Record<string, string | undefined>;
type PrototypeInspectorRoute = {
    id: string;
    title?: string;
    description?: string;
    component?: string;
    navigationId?: string;
    presentation?: string;
};
type PrototypeInspectorTransition = {
    id?: string;
    from: string;
    to: string;
    trigger?: string;
    label?: string;
};
type PrototypeInspectorFlow = {
    routes: readonly PrototypeInspectorRoute[];
    transitions: readonly PrototypeInspectorTransition[];
};
type PrototypeInspectorMode = "story" | "docs" | "flow" | "data";
type PrototypeInspectorParameter = {
    id: string;
    title: string;
    description?: string;
    status?: string;
    owner?: string;
    docs?: PrototypeInspectorDocs;
    flow?: PrototypeInspectorFlow;
    data?: unknown;
};
type PrototypeInspectorOptions = {
    addonId?: string;
    globalName?: string;
    parameterName?: string;
    toolTitle?: string;
};

type StorybookContext = {
    globals?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
};
type StorybookStory = () => ReactNode;
declare function loadPrototypeInspectorStyles(): void;
declare function getPrototypeInspectorGlobalName(options?: PrototypeInspectorOptions): string;
declare function createPrototypeInspectorDecorator(options?: PrototypeInspectorOptions): (Story: StorybookStory, context: StorybookContext) => string | number | bigint | boolean | Iterable<ReactNode> | Promise<string | number | bigint | boolean | react.ReactPortal | react.ReactElement<unknown, string | react.JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | react.JSX.Element | null | undefined;
declare function createPrototypeInspectorGlobalTypes(options?: PrototypeInspectorOptions): Record<string, {
    defaultValue: PrototypeInspectorMode;
    description: string;
}>;
declare function createPrototypeInspectorInitialGlobals(options?: PrototypeInspectorOptions): Record<string, PrototypeInspectorMode>;
declare const decorators: ((Story: StorybookStory, context: StorybookContext) => string | number | bigint | boolean | Iterable<ReactNode> | Promise<string | number | bigint | boolean | react.ReactPortal | react.ReactElement<unknown, string | react.JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | react.JSX.Element | null | undefined)[];
declare const globalTypes: Record<string, {
    defaultValue: PrototypeInspectorMode;
    description: string;
}>;
declare const initialGlobals: Record<string, PrototypeInspectorMode>;

export { type PrototypeInspectorOptions as P, type PrototypeInspectorDocKey as a, type PrototypeInspectorDocs as b, type PrototypeInspectorFlow as c, type PrototypeInspectorMode as d, type PrototypeInspectorParameter as e, type PrototypeInspectorRoute as f, type PrototypeInspectorTransition as g, createPrototypeInspectorDecorator as h, createPrototypeInspectorGlobalTypes as i, createPrototypeInspectorInitialGlobals as j, getPrototypeInspectorGlobalName as k, loadPrototypeInspectorStyles as l, decorators as m, globalTypes as n, initialGlobals as o };
