import { Icon, ToolButton } from '../../components';
import { useMediaState, useMediaActions } from './MediaProvider';
import { labels } from '../../presentation';
export function ConversionStatus() {
    const { snapshot: media } = useMediaState();
    const actions = useMediaActions();
    return (
        <>
            {' '}
            {media.job && (
                <section
                    className={`conversion-status ${['failed', 'interrupted'].includes(media.job.state) ? 'has-error' : ''}`}
                    aria-live="polite"
                >
                    <div className="job-icon">
                        <Icon
                            name={
                                media.job.running
                                    ? 'convert'
                                    : media.job.state === 'complete'
                                      ? 'check'
                                      : media.job.state === 'canceled'
                                        ? 'stop'
                                        : 'info'
                            }
                        />
                    </div>
                    <div className="job-copy">
                        <strong>
                            {media.job.running ? 'MP4' : labels[media.job.state] || media.job.state}
                        </strong>
                        <p>{media.job.message}</p>
                        {media.job.running && (
                            <div
                                className="progress-track"
                                role="progressbar"
                                aria-label="Conversion in progress"
                            >
                                <span />
                            </div>
                        )}
                    </div>
                    {media.job.running && (
                        <ToolButton
                            icon="x"
                            label="Cancel conversion"
                            onClick={() => void actions.cancel()}
                        />
                    )}
                </section>
            )}
        </>
    );
}
