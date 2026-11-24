import { Icon, type IconName } from './components';
export const labels: Record<string, string> = {
    queued: 'Queued',
    reading: 'Reading',
    starting: 'Starting',
    fetching: 'Fetching segments',
    converting: 'Converting',
    in_progress: 'Saving',
    complete: 'Completed',
    failed: 'Failed',
    interrupted: 'Interrupted',
    canceled: 'Canceled',
    skipped: 'Skipped',
};
export const modeLabels: Record<string, string> = {
    manual: 'Manual',
    image: 'Image',
    automatic: 'Automatic',
    hls: 'HLS → MP4',
    convert: 'Blob → MP4',
};
export const active = (state: string) =>
    ['queued', 'reading', 'starting', 'fetching', 'converting', 'in_progress'].includes(state);
export const size = (value: number | null) =>
    value === null ? 'Size unknown' : `${(value / 1048576).toFixed(value < 1048576 ? 2 : 1)} MiB`;
export function urlLabel(value: string) {
    try {
        const url = new URL(value);
        return url.hostname + url.pathname;
    } catch {
        return value;
    }
}
export function StateMark({ state }: { state: string }) {
    const icon: IconName =
        state === 'complete'
            ? 'check'
            : state === 'failed'
              ? 'x'
              : state === 'interrupted'
                ? 'pause'
                : state === 'canceled'
                  ? 'stop'
                  : state === 'skipped'
                    ? 'minus'
                    : 'pulse';
    return (
        <span
            className={`state-mark state-${state}`}
            role="img"
            aria-label={labels[state] || state}
            title={labels[state] || state}
        >
            <Icon name={icon} />
        </span>
    );
}
