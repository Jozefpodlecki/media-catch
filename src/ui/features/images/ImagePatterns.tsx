import { useMemo, useState } from 'react';
import { extractImagePatterns } from '../../../shared/image-patterns';
import { Info, Panel, ToolButton } from '../../components';
import { useImagesActions, useImagesState } from './ImagesProvider';

export function ImagePatterns() {
    const { images } = useImagesState();
    const actions = useImagesActions();
    const patterns = useMemo(() => extractImagePatterns(images), [images]);
    const [limit, setLimit] = useState(5);
    if (!patterns.length) return null;
    return (
        <Panel
            title="URL patterns"
            count={patterns.length}
            tools={
                <Info label="Image URL patterns">
                    <p>
                        Groups use the URLs found in image sources and enclosing links. Numeric IDs,
                        filenames, and query values become placeholders.
                    </p>
                    <p>
                        Select a group's image references, or use its fixed path prefix to begin a
                        replacement. The source choice still controls which URL downloads.
                    </p>
                    <p>
                        Patterns describe observed URLs. They do not generate missing images or new
                        signatures.
                    </p>
                </Info>
            }
        >
            <div className="image-patterns">
                {patterns.slice(0, limit).map((pattern, index) => (
                    <article className="image-pattern" key={pattern.template}>
                        <code>{pattern.template}</code>
                        <div className="image-pattern-actions">
                            <span className="subtle">
                                {pattern.count} {pattern.count === 1 ? 'URL' : 'URLs'} ·{' '}
                                {pattern.imageIds.length}{' '}
                                {pattern.imageIds.length === 1 ? 'reference' : 'references'}
                            </span>
                            <ToolButton
                                icon="filter"
                                label={`Select images for pattern ${index + 1}`}
                                onClick={() => actions.selectPattern(pattern.template)}
                            />
                            {pattern.prefix && (
                                <ToolButton
                                    icon="arrow"
                                    label={`Use path prefix for pattern ${index + 1}`}
                                    onClick={() => actions.usePatternPrefix(pattern.template)}
                                />
                            )}
                        </div>
                        <details className="image-source">
                            <summary>Example URL</summary>
                            <p>{pattern.example}</p>
                        </details>
                    </article>
                ))}
            </div>
            {patterns.length > 5 && (
                <ToolButton
                    icon={limit >= patterns.length ? 'minus' : 'plus'}
                    label={
                        limit >= patterns.length
                            ? 'Show fewer URL patterns'
                            : 'Show more URL patterns'
                    }
                    onClick={() => setLimit(limit >= patterns.length ? 5 : limit + 10)}
                />
            )}
        </Panel>
    );
}
