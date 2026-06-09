const HERMY_RECEIVER_URL = 'http://127.0.0.1:17328/streamlabs/event';

document.addEventListener('onEventReceived', function (obj) {
  fetch(HERMY_RECEIVER_URL, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(obj)
  }).catch(function (error) {
    console.log('Hermy receiver failed:', error);
  });
});
