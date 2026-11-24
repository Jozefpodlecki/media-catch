import { useEffect, useRef, useState } from 'react';
import { TextInput } from '../components';
import { validateSettingsPatch } from '../../shared/settings';
import { errorMessage } from '../../shared/errors';

export function PatternInput({
    label,
    value,
    onCommit,
    disabled,
}: {
    label: string;
    value: string;
    onCommit(value: string): void;
    disabled?: boolean;
}) {
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState('');
    const editing = useRef(false);
    useEffect(() => {
        if (!editing.current) setDraft(value);
    }, [value]);
    const commit = () => {
        try {
            const patch = validateSettingsPatch({ requestPattern: draft });
            setDraft(patch.requestPattern!);
            setError('');
            if (patch.requestPattern !== value) onCommit(patch.requestPattern!);
        } catch (failure) {
            setError(errorMessage(failure));
        }
    };
    return (
        <TextInput
            label={label}
            icon="filter"
            value={draft}
            placeholder=".m3u8"
            disabled={disabled}
            error={error}
            onValueChange={(value) => {
                setDraft(value);
                setError('');
            }}
            onFocus={() => {
                editing.current = true;
            }}
            onBlur={() => {
                editing.current = false;
                commit();
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(value);
                    setError('');
                }
            }}
        />
    );
}
