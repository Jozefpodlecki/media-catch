import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylist, collectHls, mediaUrl } from '../.build/playlist.mjs';
const encode = (text) => new TextEncoder().encode(text);

test('master parser preserves quoted codec lists and selects qualities with audio groups', () => {
    const result = parsePlaylist(
        '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1,mp4a",RESOLUTION=1280x720,AUDIO="a"\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=100\n360.m3u8\n',
        'https://test.example/master.m3u8',
    );
    assert.equal(result.variants[0].audioGroup, 'a');
    assert.equal(result.variants[0].url, 'https://test.example/720.m3u8');
    assert.equal(result.audio[0].url, 'https://test.example/audio.m3u8');
});
test('collector rewrites segment and init URIs to local files, including byte ranges', async () => {
    const requests = [];
    const read = async (url, range) => {
        requests.push([url, range]);
        return url.endsWith('.m3u8')
            ? encode(
                  '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MAP:URI="all.mp4",BYTERANGE="8@0"\n#EXTINF:1,\n#EXT-X-BYTERANGE:4@8\nall.mp4\n#EXTINF:1,\n#EXT-X-BYTERANGE:4\nall.mp4\n#EXT-X-ENDLIST\n',
              )
            : new Uint8Array(4);
    };
    const result = await collectHls('https://test.example/video.m3u8', 0, read, () => {});
    assert.deepEqual(
        requests.slice(1).map((item) => item[1]),
        ['bytes=0-7', 'bytes=8-11', 'bytes=12-15'],
    );
    const text = new TextDecoder().decode(result.files.at(-1).data);
    assert.match(text, /URI="asset-1.mp4"/);
    assert.doesNotMatch(text, /https:|BYTERANGE/);
});
test('collector supports a selected video variant and separate default audio', async () => {
    const playlists = {
        'https://t/master.m3u8':
            '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="a"\nvideo.m3u8\n',
        'https://t/video.m3u8': '#EXTM3U\n#EXTINF:1,\nv.ts\n#EXT-X-ENDLIST',
        'https://t/audio.m3u8': '#EXTM3U\n#EXTINF:1,\na.aac\n#EXT-X-ENDLIST',
    };
    const result = await collectHls(
        'https://t/master.m3u8',
        0,
        async (url) => (playlists[url] ? encode(playlists[url]) : new Uint8Array(2)),
        () => {},
    );
    assert.ok(result.audio);
    assert.notEqual(result.audio, result.video);
    assert.equal(result.files.length, 4);
});
test('encrypted, live, non-HLS, unsafe URLs, and unbounded nesting fail explicitly', async () => {
    assert.throws(
        () => parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"', 'https://t/a'),
        /Encrypted/,
    );
    assert.throws(() => parsePlaylist('<html>no</html>', 'https://t/a'), /not an HLS/);
    assert.throws(() => mediaUrl('file:///secret'), /HTTP/);
    await assert.rejects(
        collectHls(
            'https://t/live',
            0,
            async () => encode('#EXTM3U\n#EXTINF:1,\na.ts'),
            () => {},
        ),
        /Live/,
    );
    await assert.rejects(
        collectHls(
            'https://t/a',
            0,
            async () => encode('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na'),
            () => {},
        ),
        /nesting/,
    );
});

test('relative segments resolve against a redirected playlist URL', async () => {
    const seen = [];
    await collectHls(
        'https://t/redirect',
        0,
        async (url) => {
            seen.push(url);
            return url === 'https://t/redirect'
                ? {
                      data: encode('#EXTM3U\n#EXTINF:1,\nsegment.ts\n#EXT-X-ENDLIST'),
                      url: 'https://cdn.example/path/video.m3u8',
                  }
                : new Uint8Array(2);
        },
        () => {},
    );
    assert.equal(seen[1], 'https://cdn.example/path/segment.ts');
});
