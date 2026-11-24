"use strict";
const get = id => document.getElementById(id);
function render() {
  const params = new URLSearchParams({ theme: get('theme').value, state: get('state').value });
  get('popup').style.width = `${get('width').value}px`;
  get('popup').src = `/preview-popup.html?${params}`;
  get('preview-status').textContent = 'Ready. Reload after editing popup files.';
}
get('controls').addEventListener('change', render);
get('refresh').addEventListener('click', render);
render();
