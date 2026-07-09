import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatComponentValue } from "../utils/color";

interface EditableValueProps {
    value: number;
    min: number;
    max: number;
    decimals: number;
    unit?: string;
    ariaLabel: string;
    accent?: boolean;
    disabled?: boolean;
    // Override display/parsing for non-decimal notations (e.g. hex pairs).
    // parse returns NaN for text that isn't a value yet.
    format?: (value: number) => string;
    parse?: (text: string) => number;
    inputMode?: "decimal" | "text";
    onChange: (value: number) => void;
}

function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// Numeric text input paired with a slider. Valid values propagate on every
// keystroke so the slider, CSS output, and rendered colors track live; the
// display snaps back to the canonical formatted value on blur.
export default function EditableValue({
    value,
    min,
    max,
    decimals,
    unit,
    ariaLabel,
    accent = false,
    disabled = false,
    format,
    parse,
    inputMode = "decimal",
    onChange,
}: EditableValueProps) {
    // Raw text while the field is focused; null means "show the formatted value"
    const [draft, setDraft] = useState<string | null>(null);
    const valueOnFocus = useRef(value);

    const display = draft ?? (format ? format(value) : formatComponentValue(value, decimals));

    const handleChange = (text: string) => {
        setDraft(text);
        const parsed = parse ? parse(text) : parseFloat(text.trim().replace(",", "."));
        if (!Number.isNaN(parsed)) {
            onChange(clampValue(parsed, min, max));
        }
    };

    return (
        <label className={`control-value control-value-field ${accent ? "is-accent" : ""}`}>
            <input
                type="text"
                inputMode={inputMode}
                autoComplete="off"
                spellCheck={false}
                className="control-value-input"
                style={{ "--value-ch": Math.max(display.length, 2) } as CSSProperties}
                value={display}
                disabled={disabled}
                aria-label={ariaLabel}
                onFocus={(event) => {
                    valueOnFocus.current = value;
                    event.target.select();
                }}
                onChange={(event) => handleChange(event.target.value)}
                onBlur={() => setDraft(null)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                        onChange(valueOnFocus.current);
                        setDraft(null);
                        event.currentTarget.blur();
                    }
                }}
            />
            {unit ? <span className="control-value-unit">{unit}</span> : null}
        </label>
    );
}
