import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const paths = {
    rules: 'M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-8 1v6',
    image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',
    settings:
        'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3 3-3Z',
    blob: 'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',
    media: 'M4 5h16v14H4zM10 9l5 3-5 3z',
    history: 'M4 5v5h5M5 9a8 8 0 1 1-1 7m8-9v5l3 2',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z',
    refresh: 'M20 4v6h-6M4 20v-6h6M5 9a7 7 0 0 1 12-4l3 5M4 14l3 5a7 7 0 0 0 12-4',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    link: 'm10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0',
    file: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8m-8 4h5',
    frame: 'M3 5h18v14H3zM3 9h18M8 9v10',
    radio: 'M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M12 10v4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    filter: 'M4 5h16M7 12h10m-7 7h4',
    info: 'M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    check: 'm5 12 4 4L19 6',
    x: 'm6 6 12 12M6 18 18 6',
    play: 'm8 4 12 8-12 8V4Z',
    stop: 'M6 6h12v12H6z',
    expand: 'M14 3h7v7m-8 1 8-8M10 3H3v18h18v-7',
    minus: 'M5 12h14',
    plus: 'M5 12h14M12 5v14',
    chevron: 'm7 10 5 5 5-5',
    search: 'm15 15 6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    convert: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-3-3 3 3-3 3M16 18H8m3-3-3 3 3 3',
    pulse: 'M2 12h5l3-8 4 16 3-8h5',
    pause: 'M8 5v14M16 5v14',
    folder: 'M3 6h7l2 2h9v12H3V6Z',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`glyph ${className}`}
            aria-hidden="true"
        >
            <path d={paths[name]} />
        </svg>
    );
}

export function ToolButton({
    icon,
    label,
    tone = 'ghost',
    pressed,
    children,
    className = '',
    ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
    icon: IconName;
    label: string;
    tone?: 'ghost' | 'primary' | 'danger';
    pressed?: boolean;
}) {
    const tooltip = useRef<HTMLSpanElement>(null);
    const [position, setPosition] = useState({ left: 8, top: 8 });
    const place = (event: React.SyntheticEvent<HTMLSpanElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        const tip = tooltip.current?.getBoundingClientRect();
        if (!tip) return;
        setPosition({
            left: Math.max(
                8,
                Math.min(box.left + (box.width - tip.width) / 2, innerWidth - tip.width - 8),
            ),
            top: Math.max(
                8,
                Math.min(
                    box.top > tip.height + 14 ? box.top - tip.height - 6 : box.bottom + 6,
                    innerHeight - tip.height - 8,
                ),
            ),
        });
    };
    return (
        <span className={`tool-wrap ${className}`} onPointerEnter={place} onFocus={place}>
            <button
                {...props}
                type={props.type || 'button'}
                aria-label={label}
                aria-pressed={pressed}
                className={`tool-button tool-${tone} ${pressed ? 'is-on' : ''}`}
            >
                <Icon name={icon} />
                {children}
            </button>
            <span ref={tooltip} className="tooltip" style={position} aria-hidden="true">
                {label}
            </span>
        </span>
    );
}

export function Info({
    label = 'More information',
    children,
}: {
    label?: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDetailsElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 8, top: 8 });
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const summary = ref.current?.querySelector('summary');
            if (!summary || !content.current) return;
            const anchor = summary.getBoundingClientRect();
            const box = content.current.getBoundingClientRect();
            setPosition({
                left: Math.max(8, Math.min(anchor.right - box.width, innerWidth - box.width - 8)),
                top: Math.max(8, Math.min(anchor.bottom + 6, innerHeight - box.height - 8)),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node) && ref.current)
                ref.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, []);
    return (
        <details
            ref={ref}
            className="info-menu"
            onToggle={(event) => setOpen(event.currentTarget.open)}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && ref.current) {
                    ref.current.open = false;
                    ref.current.querySelector('summary')?.focus();
                }
            }}
        >
            <summary aria-label={label} title={label}>
                <Icon name="info" />
            </summary>
            <div ref={content} className="info-content" style={position}>
                {children}
            </div>
        </details>
    );
}

export function Panel({
    title,
    count,
    tools,
    children,
}: {
    title: string;
    count?: number;
    tools?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="panel">
            <header className="panel-heading">
                <h2>{title}</h2>
                {count !== undefined && <span className="count">{count}</span>}
                <div className="panel-tools">{tools}</div>
            </header>
            {children}
        </section>
    );
}

export function TextInput({
    label,
    icon = 'link',
    value,
    onValueChange,
    placeholder,
    suffix,
    actions,
    clearable = false,
    disabled,
    error,
    ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> & {
    label: string;
    icon?: IconName;
    value: string;
    onValueChange(value: string): void;
    suffix?: string;
    actions?: React.ReactNode;
    clearable?: boolean;
    error?: string;
}) {
    const id = useId();
    const ref = useRef<HTMLInputElement>(null);
    return (
        <div className="input-field">
            <label className="sr-only" htmlFor={id}>
                {label}
            </label>
            <div
                className={`input-control ${disabled ? 'is-disabled' : ''} ${error ? 'is-invalid' : ''}`}
            >
                <span className="input-icon" title={label}>
                    <Icon name={icon} />
                </span>
                <input
                    {...props}
                    id={id}
                    ref={ref}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-error` : undefined}
                    title={label}
                    value={value}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event) => onValueChange(event.target.value)}
                />
                {suffix && <span className="input-suffix">{suffix}</span>}
                {clearable && value && !disabled && (
                    <ToolButton
                        icon="x"
                        label={`Clear ${label.toLowerCase()}`}
                        className="input-action"
                        onClick={() => {
                            onValueChange('');
                            ref.current?.focus();
                        }}
                    />
                )}
                {actions && <div className="input-actions">{actions}</div>}
            </div>
            {error && (
                <p id={`${id}-error`} className="field-error">
                    {error}
                </p>
            )}
        </div>
    );
}

export function NumberInput({
    label,
    value,
    onValueChange,
    min = 1,
    max = 63.9,
    step = 0.1,
    unit = 'MiB',
    disabled,
}: {
    label: string;
    value: number;
    onValueChange(value: number): void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
}) {
    const [draft, setDraft] = useState(String(value));
    const editing = useRef(false);
    const ref = useRef<HTMLInputElement>(null);
    const id = useId();
    useEffect(() => {
        if (!editing.current) setDraft(String(value));
    }, [value]);
    const commit = (number: number) => {
        const next =
            Math.round(
                Math.max(min, Math.min(max, Number.isFinite(number) ? number : value)) * 10,
            ) / 10;
        setDraft(String(next));
        onValueChange(next);
    };
    const adjust = (direction: number) => {
        commit((draft === '' ? value : Number(draft.replace(',', '.'))) + direction * step);
        ref.current?.focus();
    };
    return (
        <div className={`input-control number-control ${disabled ? 'is-disabled' : ''}`}>
            <span className="input-icon" title={label}>
                <Icon name="filter" />
            </span>
            <label className="sr-only" htmlFor={id}>
                {label}
            </label>
            <span className="threshold-sign" aria-hidden="true">
                &gt;
            </span>
            <input
                id={id}
                ref={ref}
                role="spinbutton"
                type="text"
                inputMode="decimal"
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={draft === '' ? undefined : Number(draft.replace(',', '.'))}
                value={draft}
                title={label}
                disabled={disabled}
                onFocus={() => {
                    editing.current = true;
                }}
                onBlur={() => {
                    editing.current = false;
                    commit(draft === '' ? value : Number(draft.replace(',', '.')));
                }}
                onChange={(event) => {
                    const text = event.target.value;
                    if (/^\d*(?:[.,]\d*)?$/.test(text)) setDraft(text);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit(draft === '' ? value : Number(draft.replace(',', '.')));
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        setDraft(String(value));
                    }
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        adjust(event.key === 'ArrowUp' ? 1 : -1);
                    }
                }}
            />
            <span className="input-suffix">{unit}</span>
            <div className="stepper">
                <button
                    type="button"
                    title="Decrease threshold"
                    aria-label="Decrease threshold"
                    disabled={disabled || value <= min}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => adjust(-1)}
                >
                    <Icon name="minus" />
                </button>
                <button
                    type="button"
                    title="Increase threshold"
                    aria-label="Increase threshold"
                    disabled={disabled || value >= max}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => adjust(1)}
                >
                    <Icon name="plus" />
                </button>
            </div>
        </div>
    );
}

export interface Choice {
    value: string;
    label: string;
    detail?: string;
}
export function SelectInput({
    label,
    icon = 'chevron',
    value,
    options,
    onValueChange,
    placeholder = 'Select…',
    disabled,
    className = '',
}: {
    label: string;
    icon?: IconName;
    value: string;
    options: Choice[];
    onValueChange(value: string): void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}) {
    const id = useId();
    const button = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 220 });
    const [above, setAbove] = useState(false);
    const search = useRef({ text: '', time: 0 });
    const selected = options.findIndex((option) => option.value === value);
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const box = button.current!.getBoundingClientRect();
            const below = window.innerHeight - box.bottom;
            const above = below < 170 && box.top > below;
            const height = Math.max(48, Math.min(220, (above ? box.top : below) - 12));
            setAbove(above);
            setPosition({
                left: Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8)),
                top: above ? box.top - 6 : box.bottom + 6,
                width: box.width,
                maxHeight: height,
            });
        };
        const outside = (event: PointerEvent) => {
            if (
                !button.current?.contains(event.target as Node) &&
                !list.current?.contains(event.target as Node)
            )
                setOpen(false);
        };
        place();
        document.addEventListener('pointerdown', outside);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            document.removeEventListener('pointerdown', outside);
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);
    useEffect(() => {
        if (open)
            document.getElementById(`${id}-${highlight}`)?.scrollIntoView({ block: 'nearest' });
    }, [open, highlight, id]);
    const show = () => {
        setHighlight(Math.max(0, selected));
        setOpen(true);
    };
    const choose = (index: number) => {
        if (options[index]) onValueChange(options[index].value);
        setOpen(false);
        button.current?.focus();
    };
    const keyDown = (event: React.KeyboardEvent) => {
        const key = event.key;
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
            event.preventDefault();
            if (!open) {
                show();
                if (key === 'Home') setHighlight(0);
                if (key === 'End') setHighlight(options.length - 1);
                return;
            }
            if (key === 'Enter' || key === ' ') {
                choose(highlight);
                return;
            }
            setHighlight(
                key === 'Home'
                    ? 0
                    : key === 'End'
                      ? options.length - 1
                      : Math.max(
                            0,
                            Math.min(
                                options.length - 1,
                                highlight + (key === 'ArrowDown' ? 1 : -1),
                            ),
                        ),
            );
        } else if (key === 'Escape' || key === 'Tab') {
            setOpen(false);
        } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            search.current = {
                text: now - search.current.time > 600 ? key : search.current.text + key,
                time: now,
            };
            const index = options.findIndex((option) =>
                option.label.toLowerCase().startsWith(search.current.text.toLowerCase()),
            );
            if (index >= 0) {
                setHighlight(index);
                if (!open) setOpen(true);
            }
        }
    };
    return (
        <div className={`select-field ${className}`}>
            <button
                ref={button}
                type="button"
                role="combobox"
                aria-label={label}
                title={label}
                aria-expanded={open}
                aria-controls={`${id}-list`}
                aria-haspopup="listbox"
                aria-activedescendant={open ? `${id}-${highlight}` : undefined}
                disabled={disabled || !options.length}
                className={`input-control select-trigger ${open ? 'is-open' : ''}`}
                onClick={() => (open ? setOpen(false) : show())}
                onKeyDown={keyDown}
                onBlur={(event) => {
                    if (!list.current?.contains(event.relatedTarget as Node)) setOpen(false);
                }}
            >
                <span className="input-icon">
                    <Icon name={icon} />
                </span>
                <span className={`select-value ${selected < 0 ? 'is-placeholder' : ''}`}>
                    {options[selected]?.label || placeholder}
                </span>
                <Icon name="chevron" className={`select-chevron ${open ? 'is-open' : ''}`} />
            </button>
            {open &&
                createPortal(
                    <ul
                        id={`${id}-list`}
                        ref={list}
                        role="listbox"
                        aria-label={label}
                        className="select-menu"
                        style={{
                            position: 'fixed',
                            ...position,
                            transform: above ? 'translateY(-100%)' : undefined,
                        }}
                    >
                        {options.map((option, index) => (
                            <li
                                id={`${id}-${index}`}
                                role="option"
                                aria-selected={option.value === value}
                                key={option.value}
                                title={option.label}
                                className={`${index === highlight ? 'is-highlighted' : ''} ${option.value === value ? 'is-selected' : ''}`}
                                onPointerMove={() => setHighlight(index)}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(index)}
                            >
                                <span>
                                    <span className="option-label">{option.label}</span>
                                    {option.detail && (
                                        <span className="option-detail">{option.detail}</span>
                                    )}
                                </span>
                                {option.value === value && <Icon name="check" />}
                            </li>
                        ))}
                    </ul>,
                    document.body,
                )}
        </div>
    );
}

export function Metric({ icon, value, label }: { icon: IconName; value: number; label: string }) {
    return (
        <span className="metric" title={`${value} ${label}`} aria-label={`${value} ${label}`}>
            <Icon name={icon} />
            <span>{value}</span>
        </span>
    );
}
