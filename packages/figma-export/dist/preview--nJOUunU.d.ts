import * as react from 'react';
import { ReactNode } from 'react';

type TokenLayer = "ref" | "sys" | "comp";
type FigmaVariableType = "BOOLEAN" | "COLOR" | "FLOAT" | "STRING";
type FigmaVariableValue = boolean | number | string | {
    a: number;
    b: number;
    g: number;
    r: number;
};
type FigmaExportToken = {
    alias?: string;
    collection: TokenLayer;
    cssName: string;
    figmaName: string;
    rawValue: string;
    scopes: string[];
    type: FigmaVariableType;
    value?: FigmaVariableValue;
};
type FigmaBindingName = "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "fontFamily" | "fontSize" | "fontWeight" | "gap" | "height" | "lineHeight" | "opacity" | "paddingBottom" | "paddingLeft" | "paddingRight" | "paddingTop" | "textColor" | "width";
type FigmaLayoutStrategy = "absolute" | "autoLayout";
type FigmaNodeKind = "frame" | "image" | "svg" | "text";
type FigmaExportArtifactKind = "component" | "page";
type FigmaComponentReference = {
    key: string;
    name: string;
    sourceName: string;
    variant?: string;
    variantProperties?: Record<string, string>;
};
type FigmaExportGradientStop = {
    color: string;
    position: number;
    token?: string;
};
type FigmaExportLinearGradient = {
    angle: number;
    stops: FigmaExportGradientStop[];
};
type FigmaNodeConstraint = "CENTER" | "MAX" | "MIN" | "SCALE" | "STRETCH";
type FigmaNodeConstraints = {
    horizontal: FigmaNodeConstraint;
    vertical: FigmaNodeConstraint;
};
type FigmaBorderSideName = "bottom" | "left" | "right" | "top";
type FigmaExportBorderSide = {
    color: string;
    width: number;
};
type FigmaExportBorderSides = Partial<Record<FigmaBorderSideName, FigmaExportBorderSide>>;
type FigmaExportNode = {
    bindings: Partial<Record<FigmaBindingName, string>>;
    children: FigmaExportNode[];
    component?: FigmaComponentReference;
    kind: FigmaNodeKind;
    layoutStrategy?: FigmaLayoutStrategy;
    name: string;
    svgText?: string;
    text?: string;
    styles: {
        alignItems?: string;
        backgroundColor?: string;
        backgroundLinearGradient?: FigmaExportLinearGradient;
        borderColor?: string;
        borderSides?: FigmaExportBorderSides;
        borderWidth?: number;
        color?: string;
        constraints?: FigmaNodeConstraints;
        display?: string;
        flexDirection?: string;
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        gap?: number;
        height: number;
        justifyContent?: string;
        layoutAlign?: "STRETCH";
        layoutGrow?: number;
        layoutSizingHorizontal?: "HUG";
        layoutSizingVertical?: "HUG";
        lineHeight?: number | "normal";
        maxLines?: number;
        textTruncation?: "ENDING";
        opacity?: number;
        outOfFlow?: boolean;
        overflow?: string;
        paddingBottom?: number;
        paddingLeft?: number;
        paddingRight?: number;
        paddingTop?: number;
        radius?: number;
        textAlign?: string;
        textAlignVertical?: "CENTER";
        textAutoResize?: "WIDTH_AND_HEIGHT";
        width: number;
        x: number;
        y: number;
    };
};
type FigmaExportPayload = {
    artifactKind: FigmaExportArtifactKind;
    component?: FigmaComponentReference;
    componentTitle: string;
    generatedAt: string;
    root: FigmaExportNode;
    storyId: string;
    storyName: string;
    storyTitle: string;
    tokenSystem: {
        collections: Record<TokenLayer, string>;
        layers: Record<TokenLayer, string>;
        pluginDataKey: string;
        prefix: string;
    };
    tokens: FigmaExportToken[];
    version: 2;
};

type FigmaExportAddonOptions = {
    absoluteFidelityComponents?: string[];
    collections?: Partial<Record<TokenLayer, string>>;
    componentClassPrefixes?: string[];
    embeddedSvgByDataGraphic?: Record<string, string>;
    globalName?: string;
    pluginDataKey?: string;
    storyTitlePrefix?: false | string | string[];
    tokenLayers?: Partial<Record<TokenLayer, string>>;
    tokenPrefix?: string;
};
type ResolvedFigmaExportAddonOptions = {
    absoluteFidelityComponents: Set<string>;
    collections: Record<TokenLayer, string>;
    componentClassPrefixes: string[];
    embeddedSvgByDataGraphic: Record<string, string>;
    globalName: string;
    pluginDataKey: string;
    storyTitlePrefix: false | string[];
    tokenLayers: Record<TokenLayer, string>;
    tokenPrefix?: string;
};
declare const defaultFigmaExportGlobalName = "figmaExport";
declare function resolveFigmaExportAddonOptions(options: FigmaExportAddonOptions | undefined): ResolvedFigmaExportAddonOptions;
declare function isStoryIncludedForFigmaExport(title: string | undefined, options: ResolvedFigmaExportAddonOptions): boolean;

type StorybookContext = {
    globals?: Record<string, unknown>;
    id?: string;
    name?: string;
    title?: string;
};
type StorybookStory = () => ReactNode;
declare function getFigmaExportGlobalName(options?: FigmaExportAddonOptions): string;
declare function createFigmaExportDecorator(options?: FigmaExportAddonOptions): (Story: StorybookStory, context: StorybookContext) => react.FunctionComponentElement<{
    children?: ReactNode;
    context: {
        globals?: Record<string, unknown>;
        id?: string;
        name?: string;
        title?: string;
    };
    options?: FigmaExportAddonOptions;
}>;
declare function createFigmaExportGlobalTypes(options?: FigmaExportAddonOptions): Record<string, {
    defaultValue: "off";
    description: string;
}>;
declare function createFigmaExportInitialGlobals(options?: FigmaExportAddonOptions): Record<string, "off">;

export { type FigmaExportAddonOptions as F, type ResolvedFigmaExportAddonOptions as R, type TokenLayer as T, type FigmaExportPayload as a, type FigmaBindingName as b, type FigmaExportNode as c, type FigmaExportToken as d, type FigmaLayoutStrategy as e, type FigmaNodeKind as f, createFigmaExportDecorator as g, createFigmaExportGlobalTypes as h, createFigmaExportInitialGlobals as i, defaultFigmaExportGlobalName as j, getFigmaExportGlobalName as k, isStoryIncludedForFigmaExport as l, resolveFigmaExportAddonOptions as r };
