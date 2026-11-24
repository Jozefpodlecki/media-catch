import type { MediaObservation } from '../../shared/contracts';

export function normalizeObservation(
    value: unknown,
    frameId: number,
): MediaObservation | undefined {
    if (
        !value ||
        typeof value !== 'object' ||
        !('tag' in value) ||
        (value.tag !== 'video' && value.tag !== 'source')
    )
        return undefined;
    const text = (field: string, limit: number) => {
        const property = field in value ? value[field as keyof typeof value] : undefined;
        return typeof property === 'string' ? property.slice(0, limit) : '';
    };
    return {
        tag: value.tag,
        url: text('url', 16384),
        currentSrc: text('currentSrc', 16384),
        type: text('type', 100),
        reason: text('reason', 80),
        time: new Date().toISOString(),
        frameId,
    };
}
