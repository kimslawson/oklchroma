import {
    getSliderClassName,
    getRGBSliderVars,
    formatHexPair,
    parseHexPair,
    encodeHexTriplet,
    formatHexTriplet,
    parseHexTriplet,
} from "@components/color-pattern-generator/utils/color";
import type { Pattern } from "../types.ts";
import { colorSpaceComponents } from "../utils/constants.ts";
import EditableValue from "./editable-value.tsx";

interface ColorControlsProps {
    pattern: Pattern;
    onColorValueChange: (id: number, component: string, value: number) => void;
    onColorValuesChange: (id: number, values: Record<string, number>) => void;
}

export default function ColorControls({ pattern, onColorValueChange, onColorValuesChange }: ColorControlsProps) {
    // Hex fields show/accept two-digit hex pairs instead of decimal numbers
    const isHexSpace = pattern.colorSpace === "hex";

    return (
        <div className="color-space-controls">
            <div className="color-parameters">
                {colorSpaceComponents[pattern.colorSpace].components.map((component) => {
                    const range = colorSpaceComponents[pattern.colorSpace].ranges[component];
                    const value = pattern.colorValues[component];
                    const sliderClassName = getSliderClassName(component, pattern.colorSpace);
                    const sliderVars = getRGBSliderVars(component, pattern);
                    const decimals = range.step >= 1 ? 0 : range.step >= 0.1 ? 1 : range.step >= 0.01 ? 2 : 3;

                    return (
                        <div key={component} className="color-parameter">
                            <div className="control-row">
                                <label className="slider-label" title={range.label || component.toUpperCase()}>
                                    {component.toUpperCase()}
                                </label>
                                <EditableValue
                                    value={value}
                                    min={range.min}
                                    max={range.max}
                                    decimals={decimals}
                                    unit={range.unit}
                                    ariaLabel={`${range.label || component.toUpperCase()} value`}
                                    format={isHexSpace ? formatHexPair : undefined}
                                    parse={isHexSpace ? parseHexPair : undefined}
                                    inputMode={isHexSpace ? "text" : undefined}
                                    onChange={(next) => onColorValueChange(pattern.id, component, next)}
                                />
                            </div>
                            <input
                                type="range"
                                min={range.min}
                                max={range.max}
                                step={range.step}
                                value={value}
                                onChange={(e) => onColorValueChange(pattern.id, component, parseFloat(e.target.value))}
                                className={sliderClassName}
                                style={sliderVars}
                                data-component={component}
                                data-color-space={pattern.colorSpace}
                                // In hex mode the value fields tab sequentially; the sliders
                                // stay pointer-operable but leave the tab order
                                tabIndex={isHexSpace ? -1 : undefined}
                            />
                        </div>
                    );
                })}

                {isHexSpace && (
                    <div className="color-parameter">
                        <div className="control-row">
                            <label className="slider-label" title="Combined hex color">
                                HEX
                            </label>
                            <EditableValue
                                value={encodeHexTriplet(
                                    pattern.colorValues.r,
                                    pattern.colorValues.g,
                                    pattern.colorValues.b,
                                )}
                                min={0}
                                max={0xffffff}
                                decimals={0}
                                ariaLabel="Hex color value"
                                format={formatHexTriplet}
                                parse={parseHexTriplet}
                                inputMode="text"
                                onChange={(next) =>
                                    onColorValuesChange(pattern.id, {
                                        r: (next >> 16) & 255,
                                        g: (next >> 8) & 255,
                                        b: next & 255,
                                    })
                                }
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
