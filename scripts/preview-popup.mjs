import { isMainModule, reportFailure } from './lib/project.mjs';
import { createPreviewServer } from './preview/server.mjs';
export { createPreviewServer };
if (isMainModule(import.meta.url)) {
    const server = createPreviewServer();
    server.on('error', reportFailure);
    server.listen(8000, '127.0.0.1', () =>
        console.log(
            'React popup preview: http://127.0.0.1:8000 · HLS view: /preview-popup.html#media',
        ),
    );
}
