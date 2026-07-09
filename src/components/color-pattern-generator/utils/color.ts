import { converter, formatHex, inGamut, toGamut } from "culori";
import type { ColorSpace, Pattern } from "../types.ts";
import { colorSpaceComponents } from "./constants.ts";

export const SHADE_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const DEFAULT_MODIFIER_CURVE: [number, number, number, number] = [0.33, 0.33, 0.67, 0.67];

export const MODIFIER_CURVE_PRESETS: Record<string, [number, number, number, number]> = {
    Linear: [0.33, 0.33, 0.67, 0.67],
    "Ease out": [0.0, 0.0, 0.58, 1.0],
};

const toOklch = converter("oklch");
const isSrgbGamut = inGamut("rgb");
const isP3Gamut = inGamut("p3");

export interface OklchColor {
    mode: "oklch";
    l: number;
    c: number;
    h: number;
}

export interface ShadeAnalysis {
    percentage: number;
    outOfSrgb: boolean;
    outOfP3: boolean;
}

// Helper function to sanitize pattern name for valid CSS custom property
export function sanitizePatternName(name: string): string {
    // Allow only letters, numbers, hyphens and underscores
    // Replace any invalid character with a hyphen
    return name.replace(/[^a-zA-Z0-9_-]/g, "-");
}

// Format a numeric component without destroying hand-entered precision:
// shows minDecimals when that loses nothing, otherwise keeps the extra
// digits (capped at maxDecimals to swallow float noise).
export function formatComponentValue(value: number, minDecimals: number, maxDecimals = 6): string {
    const rounded = Number(value.toFixed(maxDecimals));
    const fixed = rounded.toFixed(minDecimals);
    return Number(fixed) === rounded ? fixed : String(rounded);
}

// Two-digit hex channel helpers for the hex color space's value fields
export function formatHexPair(value: number): string {
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

export function parseHexPair(text: string): number {
    const trimmed = text.trim().replace(/^#/, "");
    return /^[0-9a-f]{1,2}$/i.test(trimmed) ? parseInt(trimmed, 16) : NaN;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function normalizeHue(hue: number): number {
    const normalized = hue % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

export function sanitizeModifierCurve(curve?: [number, number, number, number]): [number, number, number, number] {
    if (!curve || curve.length !== 4 || curve.some((value) => Number.isNaN(value))) {
        return DEFAULT_MODIFIER_CURVE;
    }

    return [clamp01(curve[0]), clamp01(curve[1]), clamp01(curve[2]), clamp01(curve[3])];
}

function cubicBezierYAtX(x: number, curve: [number, number, number, number]): number {
    const [cp1x, cp1y, cp2x, cp2y] = sanitizeModifierCurve(curve);
    const epsilon = 1e-6;

    const sampleCurveX = (t: number): number => {
        const inv = 1 - t;
        return 3 * inv * inv * t * cp1x + 3 * inv * t * t * cp2x + t * t * t;
    };

    const sampleCurveY = (t: number): number => {
        const inv = 1 - t;
        return 3 * inv * inv * t * cp1y + 3 * inv * t * t * cp2y + t * t * t;
    };

    const sampleCurveDerivativeX = (t: number): number => {
        const inv = 1 - t;
        return 3 * inv * inv * cp1x + 6 * inv * t * (cp2x - cp1x) + 3 * t * t * (1 - cp2x);
    };

    let t = clamp01(x);
    for (let i = 0; i < 6; i += 1) {
        const currentX = sampleCurveX(t) - x;
        if (Math.abs(currentX) < epsilon) {
            break;
        }
        const derivative = sampleCurveDerivativeX(t);
        if (Math.abs(derivative) < epsilon) {
            break;
        }
        t -= currentX / derivative;
        t = clamp01(t);
    }

    let lower = 0;
    let upper = 1;
    for (let i = 0; i < 8; i += 1) {
        const currentX = sampleCurveX(t);
        if (Math.abs(currentX - x) < epsilon) {
            break;
        }
        if (x > currentX) {
            lower = t;
        } else {
            upper = t;
        }
        t = (lower + upper) * 0.5;
    }

    return clamp01(sampleCurveY(t));
}

export function getPatternColorAsOklch(pattern: Pattern): OklchColor | null {
    const { colorSpace, colorValues } = pattern;
    const colorBySpace: Record<ColorSpace, unknown> = {
        oklab: { mode: "oklab", l: colorValues.l, a: colorValues.a, b: colorValues.b },
        lch: { mode: "lch", l: colorValues.l, c: colorValues.c, h: colorValues.h },
        oklch: { mode: "oklch", l: colorValues.l / 100, c: colorValues.c, h: colorValues.h },
        hsl: { mode: "hsl", h: colorValues.h, s: colorValues.s / 100, l: colorValues.l / 100 },
        hwb: { mode: "hwb", h: colorValues.h, w: colorValues.w / 100, b: colorValues.b / 100 },
        lab: { mode: "lab", l: colorValues.l, a: colorValues.a, b: colorValues.b },
        srgb: { mode: "rgb", r: colorValues.r / 255, g: colorValues.g / 255, b: colorValues.b / 255 },
        hex: { mode: "rgb", r: colorValues.r / 255, g: colorValues.g / 255, b: colorValues.b / 255 },
        xyz: { mode: "xyz65", x: colorValues.x, y: colorValues.y, z: colorValues.z },
        "display-p3": { mode: "p3", r: colorValues.r, g: colorValues.g, b: colorValues.b },
        "a98-rgb": { mode: "a98", r: colorValues.r, g: colorValues.g, b: colorValues.b },
        "prophoto-rgb": { mode: "prophoto", r: colorValues.r, g: colorValues.g, b: colorValues.b },
        rec2020: { mode: "rec2020", r: colorValues.r, g: colorValues.g, b: colorValues.b },
    };

    const converted = toOklch(colorBySpace[colorSpace] as any) as OklchColor | undefined;
    if (!converted || converted.l === undefined || converted.c === undefined) {
        return null;
    }

    // Achromatic colors come back without a hue; default it to 0 so the
    // generated CSS never has to deal with a `none` hue channel
    return { mode: "oklch", l: converted.l, c: converted.c, h: converted.h ?? 0 };
}

export function getPatternLightnessAnchor(pattern: Pattern): number {
    const oklch = getPatternColorAsOklch(pattern);
    if (!oklch) {
        return 0.5;
    }

    return clamp01(oklch.l);
}

export function getCurveMultiplier(percentage: number, curve: [number, number, number, number]): number {
    const x = clamp01((11 - percentage / 10) * 0.1);
    return cubicBezierYAtX(x, curve);
}

export function computeScaleOklch(pattern: Pattern, percentage: number, darkMode = false): OklchColor | null {
    const baseOklch = getPatternColorAsOklch(pattern);
    if (!baseOklch) {
        return null;
    }

    const sourcePercentage = darkMode ? 110 - percentage : percentage;
    
    // Lightness Interpolation (prevents clipping)
    let lightness: number;
    if (sourcePercentage === 50) {
        lightness = baseOklch.l;
    } else if (sourcePercentage < 50) {
        const t = sourcePercentage / 50;
        lightness = baseOklch.l * t;
    } else {
        const t = (sourcePercentage - 50) / 50;
        lightness = baseOklch.l + (1 - baseOklch.l) * t;
    }
    lightness = clamp01(lightness);

    // Chroma Tapering (prevents neon colors near black/white poles)
    const curveMultiplier = getCurveMultiplier(percentage, pattern.modifierCurve);
    const chromaMultiplier = darkMode ? 0.85 : 1;
    const rawChroma = Math.max(0, pattern.baseModifier + curveMultiplier * baseOklch.c * chromaMultiplier);
    const taper = 4 * lightness * (1 - lightness);
    const chroma = rawChroma * taper;

    const hueOffset = pattern.hueShift * (1 - lightness);
    const hue = normalizeHue(baseOklch.h + hueOffset);

    return {
        mode: "oklch",
        l: lightness,
        c: chroma,
        h: hue,
    };
}

export function computeScaleAnalysis(pattern: Pattern, darkMode = false): ShadeAnalysis[] {
    const analysis: ShadeAnalysis[] = [];

    SHADE_STEPS.forEach((percentage) => {
        const oklch = computeScaleOklch(pattern, percentage, darkMode);
        if (!oklch) {
            analysis.push({
                percentage,
                outOfSrgb: false,
                outOfP3: false,
            });
            return;
        }

        analysis.push({
            percentage,
            outOfSrgb: !isSrgbGamut(oklch as any),
            outOfP3: !isP3Gamut(oklch as any),
        });
    });

    return analysis;
}

type GamutTarget = "srgb" | "p3";

function isInTargetGamut(pattern: Pattern, target: GamutTarget): boolean {
    const analysis = computeScaleAnalysis(pattern);
    return analysis.every((entry) => (target === "p3" ? !entry.outOfP3 : !entry.outOfSrgb));
}

// Resolve a pattern's non-destructive gamut fit: returns the pattern itself
// when no fit is active, otherwise a derived copy squeezed into the target
// gamut. The stored source values are never modified.
export function applyGamutFit(pattern: Pattern): Pattern {
    if (pattern.gamutFit !== "srgb" && pattern.gamutFit !== "p3") {
        return pattern;
    }
    return autoFitPatternToGamut(pattern, pattern.gamutFit);
}

export function autoFitPatternToGamut(pattern: Pattern, target: GamutTarget): Pattern {
    if (isInTargetGamut(pattern, target)) {
        return pattern;
    }

    const hasChroma = Object.prototype.hasOwnProperty.call(pattern.colorValues, "c");
    const hasSaturation = Object.prototype.hasOwnProperty.call(pattern.colorValues, "s");
    const step = 0.02;

    for (let factor = 0.98; factor >= 0; factor -= step) {
        const candidate: Pattern = {
            ...pattern,
            baseModifier: Math.max(0, pattern.baseModifier * factor),
            colorValues: {
                ...pattern.colorValues,
                ...(hasChroma ? { c: pattern.colorValues.c * factor } : {}),
                ...(hasSaturation ? { s: pattern.colorValues.s * factor } : {}),
            },
        };

        if (isInTargetGamut(candidate, target)) {
            return candidate;
        }
    }

    return {
        ...pattern,
        baseModifier: 0,
        hueShift: 0,
        colorValues: {
            ...pattern.colorValues,
            ...(hasChroma ? { c: pattern.colorValues.c * 0.2 } : {}),
            ...(hasSaturation ? { s: pattern.colorValues.s * 0.3 } : {}),
        },
    };
}

// Helper function to format color values based on color space
export function formatColor(colorSpace: ColorSpace, values: Record<string, number>): string {
    const components = colorSpaceComponents[colorSpace].components;
    const value = (index: number, minDecimals: number): string =>
        formatComponentValue(values[components[index]], minDecimals);

    // Format values based on color space
    switch (colorSpace) {
        case "oklab":
            return `oklab(${value(0, 2)} ${value(1, 3)} ${value(2, 3)})`;
        case "lch":
            return `lch(${value(0, 1)}% ${value(1, 1)} ${value(2, 0)})`;
        case "oklch":
            return `oklch(${value(0, 1)}% ${value(1, 3)} ${value(2, 0)})`;
        case "hsl":
            return `hsl(${value(0, 0)}deg ${value(1, 1)}% ${value(2, 1)}%)`;
        case "hwb":
            return `hwb(${value(0, 0)}deg ${value(1, 1)}% ${value(2, 1)}%)`;
        case "lab":
            return `lab(${value(0, 1)}% ${value(1, 1)} ${value(2, 1)})`;
        case "srgb":
            return `rgb(${value(0, 0)}, ${value(1, 0)}, ${value(2, 0)})`;
        case "hex":
            return formatHex({ mode: "rgb", r: values.r / 255, g: values.g / 255, b: values.b / 255 });
        case "xyz":
            return `color(xyz ${value(0, 3)} ${value(1, 3)} ${value(2, 3)})`;
        case "display-p3":
            return `color(display-p3 ${value(0, 3)} ${value(1, 3)} ${value(2, 3)})`;
        case "a98-rgb":
            return `color(a98-rgb ${value(0, 3)} ${value(1, 3)} ${value(2, 3)})`;
        case "prophoto-rgb":
            return `color(prophoto-rgb ${value(0, 3)} ${value(1, 3)} ${value(2, 3)})`;
        case "rec2020":
            return `color(rec2020 ${value(0, 3)} ${value(1, 3)} ${value(2, 3)})`;
        default:
            return "";
    }
}

// culori converter modes for each app color space
const culoriModeBySpace: Record<ColorSpace, string> = {
    oklab: "oklab",
    lch: "lch",
    oklch: "oklch",
    hsl: "hsl",
    hwb: "hwb",
    lab: "lab",
    srgb: "rgb",
    hex: "rgb",
    xyz: "xyz65",
    "display-p3": "p3",
    "a98-rgb": "a98",
    "prophoto-rgb": "prophoto",
    rec2020: "rec2020",
};

// Gamut-bounded target spaces get CSS-style gamut mapping (chroma reduction)
// so out-of-gamut shades degrade gracefully instead of clipping per channel
const gamutMapperBySpace: Partial<Record<ColorSpace, (color: OklchColor) => any>> = {
    srgb: toGamut("rgb", "oklch"),
    hex: toGamut("rgb", "oklch"),
    hsl: toGamut("rgb", "oklch"),
    hwb: toGamut("rgb", "oklch"),
    "display-p3": toGamut("p3", "oklch"),
    "a98-rgb": toGamut("a98", "oklch"),
    "prophoto-rgb": toGamut("prophoto", "oklch"),
    rec2020: toGamut("rec2020", "oklch"),
};

// Convert a computed OKLCH color into a CSS string in the requested space.
// Bounded targets (hex, sRGB, P3, ...) are gamut-mapped first so every
// emitted value is representable in that space.
export function formatOklchForSpace(color: OklchColor, target: ColorSpace): string {
    if (target === "oklch") {
        return `oklch(${formatComponentValue(color.l * 100, 1, 2)}% ${formatComponentValue(color.c, 3, 4)} ${formatComponentValue(color.h, 0, 2)})`;
    }

    // Gamut-map first (returns the gamut's rgb-ish mode), then convert to the
    // target's own mode — hsl/hwb are sRGB-gamut spaces but not rgb-mode objects
    const mapper = gamutMapperBySpace[target];
    const mapped = mapper ? mapper(color) : color;
    const converted: any = converter(culoriModeBySpace[target] as any)(mapped);
    const n = (value: number | undefined, minDecimals: number, maxDecimals: number): string =>
        formatComponentValue(value ?? 0, minDecimals, maxDecimals);

    switch (target) {
        case "oklab":
            return `oklab(${n(converted.l, 2, 3)} ${n(converted.a, 3, 4)} ${n(converted.b, 3, 4)})`;
        case "lch":
            return `lch(${n(converted.l, 1, 2)}% ${n(converted.c, 1, 2)} ${n(converted.h, 0, 1)})`;
        case "hsl":
            return `hsl(${n(converted.h, 0, 1)}deg ${n((converted.s ?? 0) * 100, 1, 2)}% ${n((converted.l ?? 0) * 100, 1, 2)}%)`;
        case "hwb":
            return `hwb(${n(converted.h, 0, 1)}deg ${n((converted.w ?? 0) * 100, 1, 2)}% ${n((converted.b ?? 0) * 100, 1, 2)}%)`;
        case "lab":
            return `lab(${n(converted.l, 1, 2)}% ${n(converted.a, 1, 2)} ${n(converted.b, 1, 2)})`;
        case "srgb":
            return `rgb(${n((converted.r ?? 0) * 255, 0, 1)}, ${n((converted.g ?? 0) * 255, 0, 1)}, ${n((converted.b ?? 0) * 255, 0, 1)})`;
        case "hex":
            return formatHex(converted) ?? "#000000";
        case "xyz":
            return `color(xyz ${n(converted.x, 3, 4)} ${n(converted.y, 3, 4)} ${n(converted.z, 3, 4)})`;
        case "display-p3":
        case "a98-rgb":
        case "prophoto-rgb":
        case "rec2020":
            return `color(${target} ${n(converted.r, 3, 4)} ${n(converted.g, 3, 4)} ${n(converted.b, 3, 4)})`;
        default:
            return "";
    }
}

// Helper function to get default color values for a color space
export function getDefaultColorValues(colorSpace: ColorSpace): Record<string, number> {
    const components = colorSpaceComponents[colorSpace].components;
    const ranges = colorSpaceComponents[colorSpace].ranges;

    const values: Record<string, number> = {};

    // Set default values for each component
    components.forEach((component) => {
        const range = ranges[component];

        if (component === "h") {
            values[component] = colorSpace === "oklch" ? 260 : 240; // Bias OKLCH to blue-violet for smoother default ramps
        } else if (["r", "g"].includes(component)) {
            values[component] = range.min; // Default red and green to minimum
        } else if (component === "b") {
            values[component] = range.max; // Default blue to maximum
        } else if (["l", "y"].includes(component)) {
            values[component] = range.max * 0.5; // Default lightness/Y to middle
        } else if (component === "c") {
            values[component] = range.max * 0.3; // Lower default chroma to keep initial ramps more often in sRGB gamut
        } else if (component === "s") {
            values[component] = range.max * 0.5; // Keep saturation defaults in the middle for HSL
        } else if (["w", "a", "x", "z"].includes(component)) {
            values[component] = range.min; // Default to minimum
        } else {
            values[component] = (range.min + range.max) / 2; // Default to middle of range
        }
    });

    return values;
}

// Helper function to handle backward compatibility for color space changes
export function handleColorSpaceChange(oldSpace: string, newSpace: ColorSpace): ColorSpace {
    // If the old space is srgb-linear, convert to a supported space
    if (oldSpace === "srgb-linear") {
        return "srgb";
    }

    // Check if the old space exists in our current options
    if (Object.keys(colorSpaceComponents).includes(oldSpace)) {
        return oldSpace as ColorSpace;
    }

    // Default fallback
    return newSpace;
}

// Function to get slider class name based on component and color space
export function getSliderClassName(component: string, colorSpace: ColorSpace): string {
    // Base class for all sliders
    let className = "range-input";

    // Add component-specific class
    className += ` slider-${component}`;

    // Add color space specific class
    className += ` ${colorSpace}-${component}-slider`;

    // Add special classes for specific components across color spaces
    if (component === "h") {
        className += " hue-slider";
    } else if (component === "r" && ["srgb", "hex", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020"].includes(colorSpace)) {
        className += " red-slider";
    } else if (component === "g" && ["srgb", "hex", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020"].includes(colorSpace)) {
        className += " green-slider";
    } else if (component === "b" && ["srgb", "hex", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020"].includes(colorSpace)) {
        className += " blue-slider";
    } else if (component === "w" && colorSpace === "hwb") {
        className += " whiteness-slider";
    } else if (component === "b" && colorSpace === "hwb") {
        className += " blackness-slider";
    } else if (component === "a" && ["lab", "oklab"].includes(colorSpace)) {
        className += " green-red-slider";
    } else if (component === "b" && ["lab", "oklab"].includes(colorSpace)) {
        className += " blue-yellow-slider";
    }

    return className;
}

// Function to get CSS variables for RGB-based sliders
export function getRGBSliderVars(component: string, pattern: any): Record<string, string> {
    if (!["srgb", "hex", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020"].includes(pattern.colorSpace)) {
        return {};
    }

    const colorSpace = pattern.colorSpace;
    const values = pattern.colorValues;
    const components = colorSpaceComponents[colorSpace].components;
    const otherComponents = components.filter((c) => c !== component);

    // Get current values of other components
    const value1 = values[otherComponents[0]];
    const value2 = values[otherComponents[1]];

    // Normalize values for non-sRGB color spaces (srgb and hex use 0-255 channels)
    const uses255 = colorSpace === "srgb" || colorSpace === "hex";
    const v1 = uses255 ? Math.round(value1) : value1.toFixed(3);
    const v2 = uses255 ? Math.round(value2) : value2.toFixed(3);

    if (component === "r") {
        return {
            "--slider-color1": `rgb(0, ${v1}, ${v2})`,
            "--slider-color2": `rgb(255, ${v1}, ${v2})`,
        };
    } else if (component === "g") {
        return {
            "--slider-color1": `rgb(${v1}, 0, ${v2})`,
            "--slider-color2": `rgb(${v1}, 255, ${v2})`,
        };
    } else if (component === "b") {
        return {
            "--slider-color1": `rgb(${v1}, ${v2}, 0)`,
            "--slider-color2": `rgb(${v1}, ${v2}, 255)`,
        };
    }

    return {};
}
