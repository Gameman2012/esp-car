// ========================================================================
// Section A — المتغيرات والثوابت (في الأعلى)
// ========================================================================

let use90DegreeTurns = false;
let activeButtons = new Set();
let keyboardActiveButtons = new Set();
let touchActiveButtons = new Set();
let hornActive = false;
let rotationInProgress = false;
let currentMode = "manual";
const touchPoints = new Map(); // Track active touch points and their directions
let speedSyncInterval;

// ========================================================================
// Section B — دوال المساعدة (Helper Functions)
// ========================================================================

function startSpeedSync() {
  // Clear existing interval if any
  if (speedSyncInterval) clearInterval(speedSyncInterval);

  // Sync speed every 2 seconds
  speedSyncInterval = setInterval(() => {
    fetch("/status")
      .then(response => response.json())
      .then(data => {
        if (data.speed) {
          const newSpeed = parseInt(data.speed);
          // Update slider only if different
          if (parseInt(document.getElementById("speedSlider").value) !== newSpeed) {
            document.getElementById("speedSlider").value = newSpeed;
            document.getElementById("sliderValue").innerText = `Speed: ${newSpeed}%`;
          }
        }
      })
      .catch(console.error);
  }, 2000);
}

function setupButton(buttonId, direction) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.onmousedown = () => handleButtonPress(direction, true);
  btn.onmouseup = () => handleButtonPress(direction, false);
  btn.onmouseleave = () => handleButtonPress(direction, false);
  btn.ontouchstart = (e) => handleTouchStart(e, direction);
  btn.ontouchend = (e) => handleTouchEnd(e);
}

function adjustSpeed(change) {
  const slider = document.getElementById("speedSlider");
  let newValue = parseInt(slider.value) + change;
  newValue = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), newValue));
  slider.value = newValue;
  updateSlider();
  sendSpeed();
}

function updateSlider() {
  const slider = document.getElementById("speedSlider");
  const val = slider.value;
  document.getElementById("sliderValue").innerText = `Speed: ${val}%`;
  localStorage.setItem("speedValue", val);
  sendSpeed(); // Call sendSpeed immediately on change
}

function sendSpeed() {
  const val = parseInt(document.getElementById("speedSlider").value);
  fetch(`/setpid?speed=${val}`)
    .then(response => {
      if (!response.ok) throw new Error("Network response was not ok");
      console.log("Speed updated successfully");
    })
    .catch(error => {
      console.error("Error updating speed:", error);
      document.getElementById("sliderValue").style.color = "red";
      setTimeout(() => {
        document.getElementById("sliderValue").style.color = "";
      }, 1000);
    });
}

// ========================================================================
// Section C — معالجات الأحداث (Event Handlers)
// ========================================================================

function handleTouchStart(event, direction) {
  event.preventDefault();
  // Assign this touch to the direction
  Array.from(event.changedTouches).forEach(touch => {
    touchPoints.set(touch.identifier, direction);
    activeButtons.add(direction);
  });
  handleMovement();
}

function handleTouchEnd(event) {
  event.preventDefault();
  // Remove all ended touches from tracking
  Array.from(event.changedTouches).forEach(touch => {
    const direction = touchPoints.get(touch.identifier);
    if (direction) {
      activeButtons.delete(direction);
      activeButtons.delete('_90turnExecuted');
      touchPoints.delete(touch.identifier);
    }
  });
  handleMovement();
}

function handleTouchRotation(direction, isPressed) {
  if (isPressed) {
    touchActiveButtons.add(direction);
  } else {
    touchActiveButtons.delete(direction);
    touchActiveButtons.delete('_90turnExecuted');
  }
  handleMovement();
}

function touchMove(event, direction) {
  event.preventDefault();
  // For touch, we treat touchstart as press and touchend as release
  handleButtonPress(direction, event.type === 'touchstart');
}

function handleKeyDown(event) {
  if (event.repeat) return;

  const map = {
    'ArrowUp': 'forward',
    'ArrowDown': 'backward',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'a': 'ccw', 'A': 'ccw',
    'd': 'cw', 'D': 'cw',
    'h': 'horn', 'H': 'horn',
    '+': 'increaseSpeed', '=': 'increaseSpeed',
    '-': 'decreaseSpeed'
  };

  // Prevent default for arrow keys to stop slider movement
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
  }

  if (map[event.key]) {
    if (event.key.toLowerCase() === 'h') {
      activateHorn();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      // Handle speed adjustment
      if (event.key === '+' || event.key === '=') {
        adjustSpeed(5);
      } else {
        adjustSpeed(-5);
      }
      event.preventDefault(); // Prevent any default behavior for these keys
    } else {
      keyboardActiveButtons.add(map[event.key]);
      handleMovement();
    }
  }
}

function handleKeyUp(event) {
  const map = {
    'ArrowUp': 'forward',
    'ArrowDown': 'backward',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'a': 'ccw', 'A': 'ccw',
    'd': 'cw', 'D': 'cw',
    'h': 'horn', 'H': 'horn'
  };

  if (map[event.key]) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
    }

    if (event.key.toLowerCase() === 'h') {
      deactivateHorn();  // Add this line to handle horn release
    } else {
      keyboardActiveButtons.delete(map[event.key]);
      keyboardActiveButtons.delete('_90turnExecuted');
      handleMovement();
    }
  }
}

// ========================================================================
// Section D — دوال التحكم (Control / Movement)
// ========================================================================

function handleRotation(direction, isPressed) {
  const button = document.getElementById(direction);

  if (!isPressed) {
    // Button released - stop if in continuous mode
    if (!use90DegreeTurns) {
      fetch('/stop');
    }
    button.classList.remove('active');
    rotationInProgress = false;
    return;
  }

  // Button pressed
  button.classList.add('active');

  if (use90DegreeTurns) {
    // 90° turn mode - execute once
    const endpoint = direction === 'cw' ? '/turnRight90' : '/turnLeft90';
    fetch(endpoint);
    console.log(`Executed 90° turn (${direction})`);
  } else {
    // Continuous rotation mode
    rotationInProgress = true;
    const endpoint = direction === 'cw' ? '/cw' : '/ccw';
    const rotateLoop = () => {
      if (rotationInProgress && !use90DegreeTurns) {
        fetch(endpoint);
        setTimeout(rotateLoop, 100); // Small delay between commands
      }
    };
    rotateLoop();
  }
}

function handleButtonPress(direction, isPressed) {
  if (direction === 'cw' || direction === 'ccw') {
    handleRotation(direction, isPressed);
  } else {
    // Handle other movements (forward/backward/left/right)
    const button = document.getElementById(direction);
    if (isPressed) {
      button.classList.add('active');
      fetch(`/${direction}`).catch(console.error);
    } else {
      button.classList.remove('active');
      fetch('/stop').catch(console.error);
    }
  }
}

function determineAndExecuteMovement() {
  // Don't process new commands if a 90° turn is already in progress
  if (rotationInProgress && use90DegreeTurns) return;

  const allActive = new Set([...activeButtons, ...keyboardActiveButtons]);
  let movementToExecute = 'stop';

  // Handle rotation first (highest priority)
  if (allActive.has('cw') || allActive.has('ccw')) {
    if (use90DegreeTurns) {
      movementToExecute = allActive.has('cw') ? 'turnRight90' : 'turnLeft90';
      rotationInProgress = true;

      // Reset after reasonable time (adjust 800ms as needed)
      setTimeout(() => {
        rotationInProgress = false;
        updateButtonAppearance();
      }, 800);
    } else {
      // Continuous rotation
      movementToExecute = allActive.has('cw') ? 'cw' : 'ccw';
    }
  }
  // Then handle strafing
  else if (allActive.has('left') || allActive.has('right')) {
    movementToExecute = allActive.has('left') ? 'left' : 'right';
  }
  // Then handle forward/backward
  else if (allActive.has('forward') || allActive.has('backward')) {
    movementToExecute = allActive.has('forward') ? 'forward' : 'backward';
  }

  // Execute the movement
  const endpoints = {
    forward: "/forward", backward: "/backward",
    left: "/left", right: "/right",
    cw: "/cw", ccw: "/ccw",
    turnRight90: "/turnRight90", turnLeft90: "/turnLeft90",
    stop: "/stop"
  };

  if (endpoints[movementToExecute]) {
    console.log(`Executing: ${movementToExecute}`);
    fetch(endpoints[movementToExecute])
      .then(() => console.log(`${movementToExecute} command sent`))
      .catch(err => console.error("Movement error:", err));
  }

  updateButtonAppearance();
}

function toggle90TurnMode() {
  use90DegreeTurns = document.getElementById("enable90Turn").checked;
  const controlDiv = document.getElementById("turn90Control");
  controlDiv.classList.toggle('active', use90DegreeTurns);

  // Stop any current rotation
  fetch('/stop').catch(console.error);
  activeButtons.delete('cw');
  activeButtons.delete('ccw');
  activeButtons.delete('_90turnExecuted');
  keyboardActiveButtons.delete('cw');
  keyboardActiveButtons.delete('ccw');
  keyboardActiveButtons.delete('_90turnExecuted');

  updateButtonAppearance();
}

function updateButtonAppearance() {
  // Clear all active states
  document.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));

  // Set active state for all currently pressed buttons
  const allActive = new Set([...activeButtons, ...keyboardActiveButtons]);
  allActive.forEach(dir => {
    const btn = document.getElementById(dir);
    if (btn) btn.classList.add('active');
  });

  if (hornActive) {
    document.getElementById("horn").classList.add('active');
  }
}

function activateHorn() {
  hornActive = true;
  activeButtons.add('horn');
  fetch("/horn?state=on").catch(console.error);
  updateButtonAppearance();
}

function deactivateHorn() {
  hornActive = false;
  activeButtons.delete('horn');
  fetch("/horn?state=off").catch(console.error);
  updateButtonAppearance();
}

function touchHorn(event, state) {
  event.preventDefault();
  if (state) {
    activateHorn();
  } else {
    deactivateHorn();
  }
}

// ========================================================================
// Section E — initializePage() (بدل setup() في INO)
// ========================================================================

function initializePage() {
  // Replace loadSpeedFromStorage() with:
  const storedSpeed = localStorage.getItem("speedValue") || 50;
  document.getElementById("speedSlider").value = storedSpeed;
  document.getElementById("sliderValue").innerText = `Speed: ${storedSpeed}%`;

  // Rest of your existing initialization code...
  setManualMode();
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  fetch('/icon.png')
    .then(r => favicon.href = r.ok ? '/icon.png' :
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>')
    .catch(() => favicon.href =
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>');
  document.head.appendChild(favicon);
  setupButton('forward', 'forward');
  setupButton('backward', 'backward');
  setupButton('left', 'left');
  setupButton('right', 'right');
  setupButton('cw', 'cw');
  setupButton('ccw', 'ccw');

  // Initialize checkbox
  document.getElementById("enable90Turn").checked = use90DegreeTurns;
  fetch("/syncmode?mode=manual").catch(console.error);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  fetch("/status")
    .then(response => response.json())
    .then(data => {
      if (data.speed) {
        const speed = parseInt(data.speed);
        document.getElementById("speedSlider").value = speed;
        document.getElementById("sliderValue").innerText = `Speed: ${speed}%`;
        localStorage.setItem("speedValue", speed);
      }
    })
    .catch(console.error);

  startSpeedSync();
}

function setManualMode() {
  if (currentMode !== "manual") {
    fetch("/setmanual").then(() => currentMode = "manual").catch(console.error);
  }
}

function setAutoMode() {
  // Stop all movements before switching
  fetch("/stop")
    .then(() => {
      return fetch("/syncmode?mode=auto");
    })
    .then(() => {
      window.location.href = "/";
    })
    .catch(error => {
      console.error("Error switching to auto mode:", error);
    });
}
