// ========================================================================
// Section A — المتغيرات والثوابت (في الأعلى)
// ========================================================================

const STOPWATCH_UPDATE_INTERVAL = 100; // 100ms for smooth updates (~10fps)
const STATUS_POLL_INTERVAL = 300;     // 300ms for status updates

// State variables
let running = false;
let statusUpdateInterval;
let lastStopwatchUpdate = 0;
let currentValues = {
  speed: 35,
  kp: 35,
  ki: 0.05,
  kd: 25,
  turnDelay: 250
};
// Timer Tracking Variables
let startTime = 0;
let elapsedTime = 0;
let timerInterval = null;
let isTimerRunning = false;

let currentTriggerMode = "web";
let pendingUpdates = {};
let isUpdating = false;

// ========================================================================
// Section B — دوال المساعدة (Helper Functions)
// ========================================================================

function setupSlider(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(valueId);

  // Fix: Create a proper parameter name based on the slider ID
  let param = sliderId.replace('SliderModal', '').replace('Slider', '').toLowerCase();

  // Special case for turnDelay to ensure consistent parameter naming
  if (param === 'turndelay') {
    param = 'turnDelay'; // Use camelCase to match server parameter
  }

  slider.addEventListener('input', () => {
    // Immediate UI update
    const suffix = sliderId.includes('speed') ? '%' : '';
    valueDisplay.textContent = slider.value + suffix;
    currentValues[param] = slider.value;

    // Schedule update for all parameter changes
    pendingUpdates[param] = slider.value;
    scheduleUpdate();
  });

  slider.addEventListener('change', () => {
    if (pendingUpdates[param] !== undefined) {
      sendUpdateImmediately();
    }
  });
}

function scheduleUpdate() {
  // If an update is already pending or in progress, do nothing
  if (isUpdating) return;

  // Wait 150ms before sending to batch multiple changes
  setTimeout(sendUpdateImmediately, 150);
}

function sendUpdateImmediately(specificUpdate = null) {
  if (isUpdating) return;

  isUpdating = true;
  const params = new URLSearchParams();
  const updates = specificUpdate ? specificUpdate : pendingUpdates;

  // Add all pending updates to the request
  for (const [param, value] of Object.entries(updates)) {
    params.append(param, value);
  }

  if (!specificUpdate) pendingUpdates = {}; // Clear pending updates

  fetch(`/setpid?${params.toString()}`)
    .then(response => {
      if (!response.ok) throw new Error('فشل التحديث');
      return response.json();
    })
    .then(data => {
      // Update our local values based on server response
      for (const [key, value] of Object.entries(data)) {
        if (currentValues.hasOwnProperty(key)) {
          currentValues[key] = value;
        }
      }
    })
    .catch(err => {
      console.error('Update failed:', err);
    })
    .finally(() => {
      isUpdating = false;

      // Small delay before refreshing status to avoid overwriting our changes
      setTimeout(updateStatusFromServer, 500);
    });
}

function updateSliderValue(sliderId, value) {
  const slider = document.getElementById(sliderId);
  const param = sliderId.replace('SliderModal', '').replace('Slider', '').toLowerCase();
  const valueDisplay = document.getElementById(sliderId.replace('Slider', 'Value'));

  // Visual feedback
  valueDisplay.classList.remove('updated', 'error');
  valueDisplay.classList.add('updated');

  fetch(`/setpid?${param}=${value}`)
    .then(response => {
      if (!response.ok) throw new Error('فشل التحديث');
      valueDisplay.classList.remove('updated');
    })
    .catch(err => {
      console.error('Update failed:', err);
      valueDisplay.classList.remove('updated');
      valueDisplay.classList.add('error');
      // Revert to last known good value
      slider.value = currentValues[param];
      valueDisplay.textContent = slider.value + (sliderId.includes('speed') ? '%' : '');
    });
}

function updateScrollBehavior() {
  const container = document.querySelector('.content-container');
  if (container.scrollHeight > container.clientHeight) {
    container.style.overflowY = 'auto';
  } else {
    container.style.overflowY = 'hidden';
  }
}

// Timer: Ensure we always show exactly 2 decimal places for centiseconds
function updateTimerDisplay(milliseconds) {
  const minutes = String(Math.floor((milliseconds % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((milliseconds % 60000) / 1000)).padStart(2, '0');
  const centiseconds = String(Math.floor((milliseconds % 1000) / 10)).padStart(2, '0');

  document.getElementById("timer").innerText = `${minutes}:${seconds}.${centiseconds}`;
}

// Status Functions
function updateStatusFromServer() {
  return fetch("/status?t=" + Date.now())
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then(data => {
      if (!data) return;

      // Timer and status tracking
      if (data.status) {
        const statusLower = data.status.toLowerCase();

        if (statusLower.includes("finished") && data.lastRunTime !== undefined) {
          // Use server's final time for completed runs
          elapsedTime = data.lastRunTime;
          updateTimerDisplay(elapsedTime);
          stopTimer();
        } else if (statusLower.includes("running")) {
          // Start timer if not already running
          if (!isTimerRunning) {
            resetTimer(); // Reset timer every time it starts running
            startTimer();
          }
        } else {
          // Stop timer if it was running
          if (isTimerRunning) {
            stopTimer();
          }
        }
      }

      // Sliders update
      const sliders = [
        { id: 'speedSliderModal', param: 'speed', suffix: '%' },
        { id: 'kpSlider', param: 'kp', suffix: '' },
        { id: 'kiSlider', param: 'ki', suffix: '' },
        { id: 'kdSlider', param: 'kd', suffix: '' },
        { id: 'turnDelaySlider', param: 'turnDelay', suffix: '' }
      ];

      sliders.forEach(({id, param, suffix}) => {
        // Skip updating if there's a pending update for this parameter
        if (pendingUpdates[param] !== undefined) return;

        if (data[param] !== undefined) {
          const slider = document.getElementById(id);
          const display = document.getElementById(id.replace('Slider', 'Value'));

          if (slider && display) {
            const serverValue = data[param];
            if (parseFloat(slider.value) !== parseFloat(serverValue)) {
              slider.value = serverValue;
              display.textContent = serverValue + suffix;
              currentValues[param] = serverValue; // Update our local cache
            }
          }
        }
      });

      // Update status display
      if (data.status) {
        updateStatusDisplay(data);
        updateButtonState(data.status);
      }

      // Update trigger mode
      if (data.startTrigger) {
        updateTriggerMode(data.startTrigger);
      }

      // Update history table
      if (data.history) {
        updateHistoryTable(data.history);
      }

      return data; // Return data for chaining
    })
    .catch(error => {
      console.error('Failed to update status:', error);
      stopTimer(); // Stop timer on connection failure
      setTimeout(updateStatusFromServer, 1000);
      throw error;
    });
}

function startTimer() {
  if (isTimerRunning) return;

  // Use server's start time if possible to ensure exact matching
  startTime = Date.now() - elapsedTime;
  isTimerRunning = true;

  timerInterval = setInterval(() => {
    // Ensure we round to nearest 10ms for consistent display
    elapsedTime = Math.round((Date.now() - startTime) / 10) * 10;
    updateTimerDisplay(elapsedTime);
  }, STOPWATCH_UPDATE_INTERVAL);
}

function stopTimer() {
  if (!isTimerRunning) return;

  clearInterval(timerInterval);
  isTimerRunning = false;
}

function resetTimer() {
  stopTimer();
  elapsedTime = 0;
  updateTimerDisplay(0);
}

function updateStatusDisplay(data) {
  const statusElement = document.getElementById("status");
  const triggerElement = document.getElementById("triggerMode");

  statusElement.className = "";
  const statusText = data.status.toLowerCase();

  if (statusText.includes("يعمل")) {
    statusElement.className = "running";
    statusElement.textContent = "يعمل 🚗💨";
    triggerElement.textContent = data.startTrigger === "button" ? "🖲️ زر التشغيل" : "🌐 واجهة الويب";
  } else if (statusText.includes("انتهى")) {
    statusElement.className = "finished";
    statusElement.textContent = "انتهى 🏁";
  } else if (statusText.includes("متوقف")) {
    statusElement.className = "interrupted";
    statusElement.textContent = "متوقف ⚠️";
  } else {
    statusElement.className = "ready";
    statusElement.textContent = "جاهز ✓";
    triggerElement.textContent = "-";
  }
}

function updateButtonState(status) {
  const button = document.getElementById("startStopButton");
  if (status === "يعمل" && !running) {
    running = true;
    button.innerHTML = "<span style='font-size: 1.1em; vertical-align: middle;'>■</span> إيقاف";
    button.style.backgroundColor = "#f44336";
  } else if (status !== "يعمل" && running) {
    running = false;
    button.textContent = "► تشغيل";
    button.style.backgroundColor = "#4CAF50";
  }
}

function updateTriggerMode(mode) {
  const triggerElement = document.getElementById("triggerMode");
  if (mode === "button") {
    triggerElement.textContent = "🖲️ Pushbutton";
  } else if (mode === "web") {
    triggerElement.textContent = "🌐 Web UI";
  } else {
    triggerElement.textContent = "-";
  }
}

function updateHistoryTable(history) {
  const tbody = document.getElementById("resultsBody");
  if (!history || tbody.childElementCount === history.length) return;

  tbody.innerHTML = history.map((entry, i) => {
    const time = `${String(Math.floor(entry.timeElapsed / 60000)).padStart(2,'0')}:${
      String(Math.floor((entry.timeElapsed % 60000) / 1000)).padStart(2,'0')}.${
      String(Math.floor((entry.timeElapsed % 1000) / 10)).padStart(2,'0')}`;

    let statusClass = "";
    const statusLower = entry.status.toLowerCase();

    if (statusLower.includes("interrupted")) {
      statusClass = "interrupted";
    } else if (statusLower.includes("finished")) {
      statusClass = "finished";
    } else if (statusLower.includes("running")) {
      statusClass = "running";
    }

    // Always update timer to the last record's time when table updates
    if (i === 0) {
      elapsedTime = entry.timeElapsed;
      updateTimerDisplay(elapsedTime);
      stopTimer();
    }

    const rowClasses = [i === 0 ? 'highlight' : ''].filter(Boolean).join(' ');

    return `<tr class="${rowClasses}">
      <td>${entry.roundNumber}</td>
      <td>${time}</td>
      <td>${entry.triggerMode === 'button' ? '🖲️ زر التشغيل' : '🌐 واجهة الويب'}</td>
      <td class="status-cell ${statusClass}">${entry.status}</td>
    </tr>`;
  }).join('');

  updateScrollBehavior();
}

// Modal Functions
function openSettingsModal() {
  const infoBox = document.getElementById('variableInfo');
  if (infoBox) infoBox.style.display = 'none';

  // Set sliders to current values
  document.getElementById('speedSliderModal').value = currentValues.speed;
  document.getElementById('kpSlider').value = currentValues.kp;
  document.getElementById('kiSlider').value = currentValues.ki;
  document.getElementById('kdSlider').value = currentValues.kd;
  document.getElementById('turnDelaySlider').value = currentValues.turnDelay;

  // Update displayed values
  document.getElementById('speedValueModal').textContent = currentValues.speed + '%';
  document.getElementById('kpValue').textContent = currentValues.kp;
  document.getElementById('kiValue').textContent = currentValues.ki;
  document.getElementById('kdValue').textContent = currentValues.kd;
  document.getElementById('turnDelayValue').textContent = currentValues.turnDelay;

  // Show modal
  document.getElementById('settingsModal').style.display = 'block';
}

function closeSettingsModal() {
  // Cancel any pending updates
  document.querySelectorAll('input[type=range]').forEach(slider => {
    slider.dispatchEvent(new Event('change'));
  });

  // Force refresh from server
  updateStatusFromServer().finally(() => {
    document.getElementById('settingsModal').style.display = 'none';
  });
}

// ========================================================================
// Section D — دوال التحكم (Control / Movement)
// ========================================================================

function toggleRobot() {
  currentTriggerMode = "web";
  document.getElementById("errorMessage").textContent = "";

  fetch("/startstop")
    .then(response => response.json())
    .then(data => {
      if (data.message) {
        document.getElementById("errorMessage").textContent = data.message;
      }

      // Force status update to sync timer state
      updateStatusFromServer();
    })
    .catch(err => {
      document.getElementById("errorMessage").textContent = "خطأ في الاتصال";
      console.error(err);
      stopTimer(); // Ensure timer stops on error
    });
}

function resetToDefaults() {
  fetch("/resetpid")
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        updateStatusFromServer(); // Refresh all values from ESP
      }
    })
    .catch(console.error);
}

function clearHistory() {
  if (confirm("هل تريد مسح كل السجل؟")) {
    fetch("/clearhistory", { method: 'POST' })
      .catch(console.error);
  }
}

function sendCurrentSettingsToServer() {
  const params = new URLSearchParams();
  params.append('speed', document.getElementById('speedSliderModal').value);
  params.append('kp', document.getElementById('kpSlider').value);
  params.append('ki', document.getElementById('kiSlider').value);
  params.append('kd', document.getElementById('kdSlider').value);
  params.append('turnDelay', document.getElementById('turnDelaySlider').value);

  fetch(`/setpid?${params.toString()}`)
    .catch(console.error);
}

function switchToManual() {
  // Stop robot before switching
  fetch("/stop")
    .then(() => {
      return fetch("/syncmode?mode=manual");
    })
    .then(() => {
      window.location.href = "/manual.html";
    })
    .catch(error => {
      console.error("Error switching to manual mode:", error);
      document.getElementById("errorMessage").textContent = "فشل تغيير الوضع";
    });
}

// ========================================================================
// Section E — initializePage() (بدل setup() في INO)
// ========================================================================

function initializePage() {
  // Set favicon
  const favicon = document.createElement('link');
  favicon.rel = 'icon';

  fetch('/icon.png')
    .then(response => {
      favicon.href = response.ok ? '/icon.png' :
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>';
    })
    .catch(() => {
      favicon.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>';
    });
  document.head.appendChild(favicon);

  // Setup all sliders
  setupSlider('speedSliderModal', 'speedValueModal');
  setupSlider('kpSlider', 'kpValue');
  setupSlider('kiSlider', 'kiValue');
  setupSlider('kdSlider', 'kdValue');
  setupSlider('turnDelaySlider', 'turnDelayValue');
  resetTimer();

  // Info button toggle
  document.getElementById("showInfoButton").addEventListener("click", () => {
    const infoBox = document.getElementById("variableInfo");
    infoBox.style.display = infoBox.style.display === "none" ? "block" : "none";
  });

  // Start status updates
  updateStatusFromServer().then(data => {
    if (data) {
      document.getElementById('speedSliderModal').value = data.speed || currentValues.speed;
      document.getElementById('turnDelaySlider').value = data.turnDelay || currentValues.turnDelay;
      document.getElementById('kpSlider').value = data.kp || currentValues.kp;
      document.getElementById('kiSlider').value = data.ki || currentValues.ki;
      document.getElementById('kdSlider').value = data.kd || currentValues.kd;

      // Update displayed values
      document.getElementById('speedValueModal').textContent = (data.speed || currentValues.speed) + '%';
      document.getElementById('turnDelayValue').textContent = data.turnDelay || currentValues.turnDelay;
      document.getElementById('kpValue').textContent = data.kp || currentValues.kp;
      document.getElementById('kiValue').textContent = data.ki || currentValues.ki;
      document.getElementById('kdValue').textContent = data.kd || currentValues.kd;
    }
  });
  statusUpdateInterval = setInterval(updateStatusFromServer, STATUS_POLL_INTERVAL);

  // Set auto mode
  fetch("/syncmode?mode=auto").catch(console.error);
}

// Initialize the page when loaded
document.addEventListener("DOMContentLoaded", initializePage);
