(function() {
  'use strict';
  let isExtensionEnabled = true;
  let processedVideos = new WeakSet();
  let notificationPlaying = false;

  emailjs.init('oGz1TkhSDuEOJ5esA'); // Initialize directly

  function sendEmailNotification() {
  const payload = {
    service_id: "service_kajzqqq",
    template_id: "template_vii83z7",
    user_id: "oGz1TkhSDuEOJ5esA",
    template_params: {
      message: "Notification sound was played"
    }
  };

  return fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) {
      return response.text().then(text => { throw new Error(text); });
    }
    console.log("Email sent successfully");
  })
  .catch(error => {
    console.error("Email sending failed:", error);
  });
}


  chrome.runtime.sendMessage({ action: 'getExtensionState' }, (response) => {
    if (response) {
      isExtensionEnabled = response.enabled;
    }
  });

  function handleVideoPlay(event) {
    const video = event.target;

    if (!isExtensionEnabled || notificationPlaying) {
      return;
    }

    if (processedVideos.has(video)) {
      const lastPlayTime = video.dataset.lastNotificationTime;
      const now = Date.now();
      if (lastPlayTime && (now - parseInt(lastPlayTime)) < 5000) {
        return;
      }
    }

    video.pause();
    processedVideos.add(video);
    video.dataset.lastNotificationTime = Date.now().toString();
    notificationPlaying = true;

    chrome.runtime.sendMessage({ action: 'playNotificationSound' }, (response) => {
      if (response && response.success) {
        setTimeout(() => {
          if (!video.paused) return;
          video.play().catch(error => console.log('Video play failed:', error));
          notificationPlaying = false;
        }, 400);
      } else {
        video.play().catch(error => console.log('Video play failed:', error));
        notificationPlaying = false;
      }
    });
  }

  function addVideoListeners(video) {
    if (video.dataset.notificationListenerAdded) return;
    video.dataset.notificationListenerAdded = 'true';

    video.addEventListener('play', handleVideoPlay, { once: false });
    video.addEventListener('loadstart', () => {
      if (video.autoplay && !video.paused) {
        handleVideoPlay({ target: video });
      }
    });
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(addVideoListeners);
  }

  scanForVideos();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO') {
              addVideoListeners(node);
            }
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos) {
              videos.forEach(addVideoListeners);
            }
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extensionStateChanged') {
      isExtensionEnabled = request.enabled;
      sendResponse({ success: true });
    } else if (request.action === 'playCustomNotificationSound') {
      playCustomNotificationSound().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Error playing custom notification sound:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  });

  async function playCustomNotificationSound() {
    try {
      const storage = await chrome.storage.local.get(['useCustomSound', 'customSoundData']);
      if (storage.useCustomSound && storage.customSoundData) {
        const audio = new Audio(storage.customSoundData);
        audio.volume = 0.5;
        const playAudio = () => {
          return audio.play().then(() => {
            console.log('Custom notification sound played');
            sendEmailNotification(); // <-- send email here
          }).catch(error => {
            console.error('Error playing custom sound:', error);
            return playDefaultSound();
          });
        };
        if (audio.readyState >= 2) {
          await playAudio();
        } else {
          await new Promise((resolve, reject) => {
            audio.addEventListener('canplay', () => playAudio().then(resolve).catch(reject), { once: true });
            audio.addEventListener('error', () => {
              playDefaultSound().then(resolve).catch(reject);
            }, { once: true });
          });
        }
      } else {
        await playDefaultSound();
      }
    } catch (error) {
      console.error('Error in playCustomNotificationSound:', error);
      await playDefaultSound();
    }
  }

  function playDefaultSound() {
    return new Promise((resolve, reject) => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 0.3;
        const frequency = 880;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
        setTimeout(() => {
          try {
            oscillator.disconnect();
            gainNode.disconnect();
            console.log('Default notification sound played');
            sendEmailNotification(); // <-- send email here too
            resolve();
          } catch (e) {
            resolve();
          }
        }, duration * 1000 + 100);
      } catch (error) {
        console.error('Error playing default sound:', error);
        reject(error);
      }
    });
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(scanForVideos, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
})();
