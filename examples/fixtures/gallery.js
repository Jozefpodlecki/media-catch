const shadowImage = document.createElement('img');
shadowImage.src = '/thumb/shadow.png';
shadowImage.alt = 'Open shadow root';
shadowImage.width = 160;
document.getElementById('shadow').attachShadow({ mode: 'open' }).append(shadowImage);
