export type TokenLayer = "ref" | "sys" | "comp";

export type FigmaVariableType = "BOOLEAN" | "COLOR" | "FLOAT" | "STRING";

export type FigmaVariableValue =
  | boolean
  | number
  | string
  | {
      a: number;
      b: number;
      g: number;
      r: number;
    };

export type FigmaExportToken = {
  alias?: string;
  collection: TokenLayer;
  cssName: string;
  figmaName: string;
  rawValue: string;
  scopes: string[];
  type: FigmaVariableType;
  value?: FigmaVariableValue;
};

export type FigmaBindingName =
  | "backgroundColor"
  | "borderColor"
  | "borderWidth"
  | "cornerRadius"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "gap"
  | "height"
  | "lineHeight"
  | "opacity"
  | "paddingBottom"
  | "paddingLeft"
  | "paddingRight"
  | "paddingTop"
  | "textColor"
  | "width";

export type FigmaLayoutStrategy = "absolute" | "autoLayout";

export type FigmaNodeKind = "frame" | "image" | "svg" | "text";

export type FigmaExportArtifactKind = "component" | "page";

export type FigmaComponentReference = {
  key: string;
  name: string;
  sourceName: string;
  variant?: string;
  variantProperties?: Record<string, string>;
};

export type FigmaExportGradientStop = {
  color: string;
  position: number;
  token?: string;
};

export type FigmaExportLinearGradient = {
  angle: number;
  stops: FigmaExportGradientStop[];
};

export type FigmaExportGradient = {
  angle: number;
  stops: FigmaExportGradientStop[];
  type: "radial" | "angular";
};

export type FigmaExportShadow = {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
  spread: number;
  type: "drop" | "inner";
};

export type FigmaNodeConstraint = "CENTER" | "MAX" | "MIN" | "SCALE" | "STRETCH";

export type FigmaNodeConstraints = {
  horizontal: FigmaNodeConstraint;
  vertical: FigmaNodeConstraint;
};

export type FigmaBorderSideName = "bottom" | "left" | "right" | "top";

export type FigmaExportBorderSide = {
  color: string;
  width: number;
};

export type FigmaExportBorderSides = Partial<
  Record<FigmaBorderSideName, FigmaExportBorderSide>
>;

export type FigmaExportNode = {
  bindings: Partial<Record<FigmaBindingName, string>>;
  children: FigmaExportNode[];
  component?: FigmaComponentReference;
  kind: FigmaNodeKind;
  layoutStrategy?: FigmaLayoutStrategy;
  name: string;
  svgText?: string;
  text?: string;
  imageBytes?: string;
  styles: {
    alignItems?: string;
    backgroundBlur?: number;
    backgroundColor?: string;
    backgroundGradient?: FigmaExportGradient;
    backgroundLinearGradient?: FigmaExportLinearGradient;
    borderColor?: string;
    borderSides?: FigmaExportBorderSides;
    borderWidth?: number;
    boxShadow?: FigmaExportShadow[];
    color?: string;
    constraints?: FigmaNodeConstraints;
    counterAxisSpacing?: number;
    display?: string;
    flexDirection?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: "italic";
    fontWeight?: number;
    gap?: number;
    height: number;
    justifyContent?: string;
    layerBlur?: number;
    layoutAlign?: "STRETCH";
    layoutGrow?: number;
    layoutSizingHorizontal?: "HUG";
    layoutSizingVertical?: "HUG";
    layoutWrap?: "WRAP";
    letterSpacing?: number;
    lineHeight?: number | "normal";
    maxLines?: number;
    textTruncation?: "ENDING";
    objectFit?: string;
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
    textDecoration?: "UNDERLINE" | "STRIKETHROUGH";
    width: number;
    x: number;
    y: number;
  };
};

export type FigmaExportPayload = {
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
