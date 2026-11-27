/* Hidden page that makes the sound. The background worker tells it what level to play at. */
(function () {
  'use strict';
  const audio = new FlowAudio();

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== 'offscreen') return;
    if (msg.type === 'level') audio.setLevel(msg.db, msg.rampMs, msg.fromDb);
    else if (msg.type === 'track') audio.setTrack(msg.track);
    else if (msg.type === 'volume') audio.setVolume(msg.volume);
  });

  (async () => {
    const init = await chrome.runtime.sendMessage({ type: 'hello' });
    if (!init) return;
    audio.trackId = init.track;
    audio.setVolume(init.volume);
    await audio.unlock();
    audio.setLevel(init.db, init.rampMs, init.fromDb);
    // While music plays, give the worker a finer clock than its 30 s alarm.
    setInterval(() => {
      if (audio.running) chrome.runtime.sendMessage({ type: 'tick' }).catch(() => {});
    }, 5000);
  })();
})();
