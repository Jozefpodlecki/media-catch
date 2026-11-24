"use strict";
let demoUrl;
document.getElementById("create").onclick = () => {
  if (demoUrl) URL.revokeObjectURL(demoUrl);
  demoUrl = URL.createObjectURL(new Blob(["Media Catch test succeeded.\n"], { type: "text/plain" }));
  const link = document.getElementById("link");
  link.href = demoUrl;
  link.download = "blob-test.txt";
  link.textContent = demoUrl;
};
document.getElementById("revoke").onclick = () => {
  if (demoUrl) URL.revokeObjectURL(demoUrl);
};
for (const [id, size] of [["large", 11], ["boundary", 10]]) {
  document.getElementById(id).onclick = () => {
    const blob = new Blob([new Uint8Array(size * 1024 * 1024)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    URL.revokeObjectURL(url);
    document.getElementById("link").textContent = `Created and revoked a ${size} MiB blob. Check the watcher status and Downloads.`;
  };
}
