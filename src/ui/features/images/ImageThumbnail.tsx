import { useState } from 'react';
import type { ImageCandidate } from '../../../shared/images';
import { imageUrl } from '../../../shared/images';
import { Icon } from '../../components';

export function ImageThumbnail({ image }: { image: ImageCandidate }) {
    let src = '';
    try {
        src = imageUrl(image.currentSrc || image.src || image.href);
    } catch {
        src = '';
    }
    return <Thumbnail key={src} src={src} alt={image.alt} />;
}

function Thumbnail({ src, alt }: { src: string; alt: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="image-thumbnail">
            {src && !failed ? (
                <img
                    src={src}
                    alt={alt || 'Scanned image preview'}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                />
            ) : (
                <span
                    className="image-thumbnail-fallback"
                    role="img"
                    aria-label="Preview unavailable"
                >
                    <Icon name="image" />
                    <span>Preview unavailable</span>
                </span>
            )}
        </div>
    );
}
