#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <Preferences.h>
#define FS LittleFS  // Optional: Alias for easier replacement
Preferences preferences;

const int sensorPins[5] = { 19, 18, 21, 17, 16 };                      // leftmost (0) to rightmost (4)
const int ENA = 33, IN1 = 25, IN2 = 26, ENB = 12, IN3 = 27, IN4 = 14;  // Motor driver (L298N) pins
const int BUZZER_PIN = 32, BUTTON_PIN = 13, LED_PIN = 2;               // Additional Pins

float Kp = 35, Ki = 0.05, Kd = 25;  // PID variables( Proportional gain / Integral gain / Derivative gain )

// System variables
bool manualMode = false;
int speedPercentage = 30;  // Default speed (30%)
unsigned long lastStopwatchUpdate = 0;
const unsigned long stopwatchUpdateInterval = 50;  // Update every 50ms
String robotStatus = "";
String statusColor = "red";      // Default to red for stopped/interrupted states
String currentTriggerMode = "";  // Empty initially
int sensorReadings[5];
int turnDelay = 250;
float pidKp, pidKi, pidKd;
int count = 0;
// PID state
float lastError = 0;
float integral = 0;
int Imax = 50;
// Robot state variables
bool isRunning = false;
bool buttonPressed = false;
bool startScheduled = false;
unsigned long startScheduledTime = 0;
unsigned long startDelayTime = 500;  // 0.5 second delay before starting
unsigned long startTime = 0;
unsigned long elapsedTime = 0;
unsigned long stopwatchValue = 0;
bool shouldStoreStopwatch = false;
unsigned long lastLedToggle = 0;
bool ledState = false;
String startTriggerMode = "";      // Tracks how the run was started
String interruptTriggerMode = "";  // Tracks how it was interrupted
enum Movement {
  STOP,
  FORWARD,
  BACKWARD,
  RIGHT,
  LEFT,
  ROTATE_CW,
  ROTATE_CCW
};
// Round history
struct RoundRecord {
  int roundNumber;
  unsigned long timeElapsed;
  String status;
  String triggerMode;
};
RoundRecord roundHistory[10];
int currentRound = 1;
int historyCount = 0;

// Web server
WebServer server(80);

void FollowPathPID() {
  if (manualMode) {
    return;
  }
  if (isRunning) {
    // Weighted error: inner sensors stronger
    readSensors();
    int weights[5] = { -1, -2, 0, 2, 1 };
    float error = 0;
    float correction;
    count = 0;
    for (int i = 0; i < 5; i++) {
      if (sensorReadings[i] == HIGH) {
        error += weights[i];
        count++;
      }
    }


    // PID terms
    integral += error;
    integral = constrain(integral, -Imax, Imax);
    float derivative = error - lastError;
    correction = Kp * error + Ki * integral + Kd * derivative;
    lastError = error;

    // Compute motor speeds
    int speedL = constrain(255 * speedPercentage / 100 - correction, -255, 255);
    int speedR = constrain(255 * speedPercentage / 100 + correction, -255, 255);
    if (count == 5) {
      move(STOP);
      endProcedure();
      return;  // Exit completely
    }
    setMotorSpeeds(speedL, speedR);
    detect90();
  }
}
void detect90() {
  readSensors();

  // Only proceed if center sensor detects line
  if (sensorReadings[2] == HIGH) {
    // Wait while center sensor is HIGH
    while (sensorReadings[2] == HIGH) {
      readSensors();

      // Check if all sensors are HIGH (end of track)
      bool allSensorsHigh = true;
      for (int i = 0; i < 5; i++) {
        if (sensorReadings[i] == LOW) {
          allSensorsHigh = false;
          break;
        }
      }

      if (allSensorsHigh) {
        endProcedure();
        return;
      }

      delay(5);  // Small delay to prevent watchdog issues
    }
    // Count how many other sensors are HIGH
    int highCount = 0;
    for (int i = 0; i < 5; i++) {
      if (i != 2 && sensorReadings[i] == HIGH) {
        highCount++;
      }
    }
    if (highCount >= 1) {
      // Center sensor went LOW, now check other sensors
      readSensors();
      move(STOP);
      delay(100);
      readSensors();
      // Back up a bit to get better positioning
      setMotorSpeeds(-130, -130);
      delay(turnDelay);
      move(STOP);
      delay(100);
      // Perform detection sweep to left
      readSensors();
      turnRightdetection();
      turnLeftdetection();
      delay(5);
    }
  }
}


void turnLeftdetection() {
  move(STOP);
  delay(50);
  // Rotate counter-clockwise for detection
  while (sensorReadings[0] == LOW && sensorReadings[1] == LOW) {
    setMotorSpeeds(0, 100);
    readSensors();
    if (sensorReadings[0] == HIGH || sensorReadings[1] == HIGH) {
      break;  // Left sensors detected black
    }
    delay(10);  // Small delay to prevent watchdog issues
  }
  move(STOP);
  delay(50);
}

void turnRightdetection() {
  move(STOP);
  delay(50);
  // Rotate clockwise for detection
  while (sensorReadings[3] == LOW && sensorReadings[4] == LOW) {
    setMotorSpeeds(100, 0);
    readSensors();
    if (sensorReadings[3] == HIGH || sensorReadings[4] == HIGH) {
      break;  // Right sensors detected black
    }
    delay(10);  // Small delay to prevent watchdog issues
  }             // Shorter delay for detection sweep
  move(STOP);
  delay(50);
}
void turnLeft90() {
  move(STOP);
  delay(50);  
    setMotorSpeeds(-130, 130); // Rotate counter-clockwise
    delay(turnDelay);
    readSensors();    
  move(STOP);
  delay(50);
}

void turnRight90() {
  move(STOP);
  delay(50);  
    setMotorSpeeds(130, -130); // Rotate clockwise
    delay(turnDelay);
    readSensors();  
  move(STOP);
  delay(50);
}
void updateStopwatch() {
  unsigned long currentMillis = millis();
  if (currentMillis - lastStopwatchUpdate >= stopwatchUpdateInterval) {
    stopwatchValue = currentMillis - startTime;
    lastStopwatchUpdate = currentMillis;
  }
}
// Helper: add a field to JSON response with comma handling
void addJsonField(String& json, bool& updated, String key, String val) {
  if (updated) json += ",";
  json += "\"" + key + "\":" + val;
  updated = true;
}

// Helper: apply an integer parameter with constrain
void applyIntParam(String name, int& var, int lo, int hi, String& json, bool& updated) {
  if (!server.hasArg(name)) return;
  var = constrain(server.arg(name).toInt(), lo, hi);
  preferences.putInt(name, var);
  addJsonField(json, updated, name, String(var));
}

// Helper: apply a float parameter with constrain
void applyFloatParam(String name, float& var, int dec, float lo, float hi, String& json, bool& updated) {
  if (!server.hasArg(name)) return;
  var = constrain(server.arg(name).toFloat(), lo, hi);
  preferences.putFloat(name, var);
  addJsonField(json, updated, name, String(var, dec));
}

void handleSetPID() {
  // Check if client is still connected
  if (!server.client().connected()) {
    server.send(408, "text/plain", "Request timeout");
    return;
  }
  preferences.begin("robot-config", false);
  bool updated = false;
  String jsonResponse = "{";

  // Update speed if provided (int, 10-100)
  applyIntParam("speed", speedPercentage, 10, 100, jsonResponse, updated);

  // Update turn delay if provided (int, 0-1000)
  applyIntParam("turnDelay", turnDelay, 0, 1000, jsonResponse, updated);

  // Update kp if provided (float, 1 decimal, 0-100)
  applyFloatParam("kp", Kp, 1, 0.0, 100.0, jsonResponse, updated);

  // Update ki if provided (float, 2 decimals, 0-1)
  applyFloatParam("ki", Ki, 2, 0.0, 1.0, jsonResponse, updated);

  // Update kd if provided (float, 1 decimal, 0-100)
  applyFloatParam("kd", Kd, 1, 0.0, 100.0, jsonResponse, updated);

  jsonResponse += "}";
  preferences.end();  // Commit changes once

  if (updated) {
    server.send(200, "application/json", jsonResponse);
  } else {
    server.send(400, "application/json", "{\"error\":\"No valid parameters\"}");
  }
}

void resetPIDState() {
  integral = 0;
  lastError = 0;
}

void resetPID() {
  // إذا كان الروبوت يعمل، أوقفه أولاً لمنع قفزة PID أثناء التشغيل
  if (isRunning) {
    stopRobot();
  }

  preferences.begin("robot-config", false);
  preferences.clear();  // Delete all saved settings

  // Reset to defaults in memory and active variables
  Kp = 40.0;
  Ki = 0.05;
  Kd = 45.0;
  speedPercentage = 30;
  turnDelay = 260;

  // حفظ القيم في Preferences حتى لا تعود للقديمة بعد إعادة الإقلاع
  preferences.putFloat("Kp", Kp);
  preferences.putFloat("Ki", Ki);
  preferences.putFloat("Kd", Kd);
  preferences.putInt("speedPercentage", speedPercentage);
  preferences.putInt("turnDelay", turnDelay);

  preferences.end();

  resetPIDState();

  server.send(200, "application/json", "{\"success\":true,\"message\":\"Reset to defaults\"}");
}
void LoadDefaultValues() {
  preferences.begin("robot-config", false);  // Changed to read-write mode

  // Read with defaults
  Kp = preferences.getFloat("kp", 35.0);
  Ki = preferences.getFloat("ki", 0.05);
  Kd = preferences.getFloat("kd", 25.0);
  speedPercentage = preferences.getInt("speed", 35);
  turnDelay = preferences.getInt("turnDelay", 250);

  // Optional: Print loaded values for debugging
  Serial.println("Loaded Values:");
  Serial.printf("Kp: %f, Ki: %f, Kd: %f\n", Kp, Ki, Kd);
  Serial.printf("Speed: %d, Turn Delay: %d\n", speedPercentage, turnDelay);

  preferences.end();  // Commit changes
}

void startRobot() {
  if (manualMode) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Cannot start in Manual Mode\"}");
    return;
  }
  startTriggerMode = currentTriggerMode;  // Store how we started
  interruptTriggerMode = "";              // Reset interrupt
  startScheduled = false;                 // Cancel any scheduled start
  stopwatchValue = 0;
  startTime = millis();
  lastStopwatchUpdate = millis();
  shouldStoreStopwatch = true;

  isRunning = true;
  robotStatus = "Running";
  statusColor = "green";

  digitalWrite(LED_PIN, HIGH);  // Turn on LED when running
  beep(300);
}
void stopRobot() {
  if (robotStatus == "Finished 🏁") {
    isRunning = false;
    resetPIDState();
    move(STOP);
    digitalWrite(LED_PIN, LOW);
    return;
  }

  isRunning = false;
  resetPIDState();
  startScheduled = false;
  move(STOP);
  digitalWrite(LED_PIN, LOW);

  // Determine the correct status message
  String stopStatus;
  if (interruptTriggerMode != "" && interruptTriggerMode != startTriggerMode) {
    // Cross-mode interruption (button stopped web-started or vice versa)
    stopStatus = (interruptTriggerMode == "button") ? "Button Interrupted 🛑" : "Web Interrupted 🖥️";
  } else if (interruptTriggerMode == "button") {
    // Button stopped button-started run
    stopStatus = "Button Interrupted 🛑";
  } else if (interruptTriggerMode == "web") {
    // Web stopped web-started run
    stopStatus = "Web Interrupted 🖥️";
  } else {
    // Normal stop (not an interruption)
    stopStatus = "Button Interrupted 🛑";
  }

  // Only add to history if we have a valid run time
  if (shouldStoreStopwatch && robotStatus != "Finished 🏁") {
    elapsedTime = millis() - startTime;
    stopwatchValue = elapsedTime;
    addRoundToHistory(stopStatus, startTriggerMode);
  }

  shouldStoreStopwatch = false;
  robotStatus = stopStatus;
  statusColor = "red";
  beep(100);

  // Reset interrupt trigger after handling
  interruptTriggerMode = "";
}
void endProcedure() {
  if (robotStatus == "Finished 🏁") return;

  // 1. Immediately stop motors and disable running state
  isRunning = false;
  move(STOP);
  digitalWrite(LED_PIN, LOW);

  // 2. Reset PID controller state
  lastError = 0;
  integral = 0;

  // 3. Record the final time
  elapsedTime = millis() - startTime;
  stopwatchValue = elapsedTime;
  addRoundToHistory("Finished 🏁", startTriggerMode);

  // 4. Update status (after stopping)
  robotStatus = "Finished 🏁";
  statusColor = "green";

  // 5. Clear any pending start triggers
  startScheduled = false;
  buttonPressed = false;

  // 6. Play finish beeps (optional)
  for (int i = 0; i < 3; i++) {
    beep(200);
    if (i < 2) delay(200);
  }
}
void handleStartTrigger() {
  // Handle scheduled start (if applicable)
  if (startScheduled && !isRunning && !manualMode && (millis() - startScheduledTime >= startDelayTime)) {
    startScheduled = false;
    startRobot();
  }
  // Button press detection (falling edge)
  if (digitalRead(BUTTON_PIN) == LOW && !buttonPressed) {
    buttonPressed = true;
    currentTriggerMode = "button";

    if (isRunning) {
      interruptTriggerMode = "button";  // Record that stop was triggered by button
      stopRobot();
    } else if (!manualMode) {
      startScheduled = true;
      startScheduledTime = millis();
    }
  }

  // Button release detection (rising edge)
  if (digitalRead(BUTTON_PIN) == HIGH && buttonPressed) {
    buttonPressed = false;
  }
}
void setMotorSpeeds(int leftSpeed, int rightSpeed) {
  // Set individual motor speeds using analogWrite
  // Motor A - Left
  if (leftSpeed >= 0) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
    leftSpeed = -leftSpeed;
  }
  // Motor B - Right
  if (rightSpeed >= 0) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
    rightSpeed = -rightSpeed;
  }
  // Apply PWM values using analogWrite
  analogWrite(ENA, leftSpeed);
  analogWrite(ENB, rightSpeed);
}
void move(Movement direction) {
  int currentSpeed = (direction == STOP) ? 0 : (255 * speedPercentage / 100);
  switch (direction) {
    case FORWARD:
      setMotorSpeeds(currentSpeed, currentSpeed);
      break;
    case BACKWARD:
      setMotorSpeeds(-currentSpeed, -currentSpeed);
      break;
    case RIGHT:
      setMotorSpeeds(currentSpeed, 0);
      break;
    case LEFT:
      setMotorSpeeds(0, currentSpeed);
      break;
    case ROTATE_CW:
      setMotorSpeeds(currentSpeed, -currentSpeed);
      break;
    case ROTATE_CCW:
      setMotorSpeeds(-currentSpeed, currentSpeed);
      break;
    case STOP:
    default:
      setMotorSpeeds(0, 0);
      break;
  }
}
void beep(int duration) {
  // Buzzer function
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}
void updateLedStatus() {
  // Update LED based on robot status
  unsigned long currentMillis = millis();
  if (manualMode) {
    // Different blink pattern for manual mode
    if (currentMillis - lastLedToggle >= 500) {  // Slower blink
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
      lastLedToggle = currentMillis;
    }
  } else if (isRunning) {
    // Fast blink while running
    if (currentMillis - lastLedToggle >= 200) {  // Fast blink
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
      lastLedToggle = currentMillis;
    }
  } else if (startScheduled) {
    // Rapid blinking during wait period
    if ((currentMillis % 250) < 125) {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  } else {
    // Normally off when not running and not in manual mode
    digitalWrite(LED_PIN, LOW);
  }
}
void addRoundToHistory(String status, String trigger) {
  RoundRecord newRecord;
  newRecord.roundNumber = currentRound;
  newRecord.timeElapsed = stopwatchValue;
  newRecord.status = status;
  newRecord.triggerMode = trigger;  // Use the passed trigger mode

  if (stopwatchValue == 0 && status != "Finished 🏁") return;

  // Shift history array
  if (historyCount >= 10) {
    for (int i = 9; i > 0; i--) {
      roundHistory[i] = roundHistory[i - 1];
    }
    historyCount = 10;
  } else {
    for (int i = historyCount; i > 0; i--) {
      roundHistory[i] = roundHistory[i - 1];
    }
    historyCount++;
  }

  roundHistory[0] = newRecord;
  currentRound++;
}
void clearHistory() {
  historyCount = 0;
  currentRound = 1;
  startTriggerMode = "";
  interruptTriggerMode = "";  // Reset interrupt
  stopwatchValue = 0;
  robotStatus = "Ready";
  Serial.println("History cleared");
}
// Web server handlers
void handleRoot() {
  // Redirect to the index.html file
  server.sendHeader("Location", "/index.html", true);
  server.send(302, "text/plain", "");
}
void handleManualControl() {
  // Redirect to the manual.html file
  server.sendHeader("Location", "/manual.html", true);
  server.send(302, "text/plain", "");
}
void handleStartStop() {
  readSensors();
  int count = 0;
  for (int i = 0; i < 5; i++) {
    if (sensorReadings[i] == HIGH) { count++; }
  }

  // Update the handleStartStop function to track the trigger mode
  if (isRunning) {
    // Explicitly mark this as a web interruption
    interruptTriggerMode = "web";
    currentTriggerMode = "web";
    stopRobot();
    server.send(200, "application/json", "{\"success\":true}");
  } else {
    if (count == 5) {
      server.send(200, "application/json", "{\"success\":false,\"message\":\"Place robot on track first!\"}");
      return;
    }  //all sensors on black
    currentTriggerMode = "web";
    startTriggerMode = "web";
    startRobot();
    server.send(200, "application/json", "{\"success\":true}");
  }
}
void readSensors() {
  for (int i = 0; i < 5; i++) sensorReadings[i] = digitalRead(sensorPins[i]);
}
void handleStatus() {
  String json = "{";
  json += "\"startTrigger\":\"" + startTriggerMode + "\",";
  json += "\"status\":\"" + robotStatus + "\",";
  json += "\"color\":\"" + statusColor + "\",";
  json += "\"stopwatch\":" + String(stopwatchValue) + ",";
  json += "\"mode\":\"" + String(manualMode ? "manual" : "auto") + "\",";
  json += "\"kp\":" + String(Kp, 1) + ",";
  json += "\"ki\":" + String(Ki, 2) + ",";
  json += "\"kd\":" + String(Kd, 1) + ",";
  json += "\"speed\":" + String(speedPercentage) + ",";
  json += "\"turnDelay\":" + String(turnDelay) + ",";
  json += "\"currentTrigger\":\"" + currentTriggerMode + "\",";
  if (robotStatus == "Finished 🏁") {
    json += "\"finalTime\":" + String(stopwatchValue) + ",";
  }
  json += "\"history\":[";
  for (int i = 0; i < historyCount; i++) {
    if (i > 0) json += ",";
    json += "{";
    json += "\"roundNumber\":" + String(roundHistory[i].roundNumber) + ",";
    json += "\"timeElapsed\":" + String(roundHistory[i].timeElapsed) + ",";
    json += "\"status\":\"" + roundHistory[i].status + "\",";
    json += "\"triggerMode\":\"" + roundHistory[i].triggerMode + "\"";
    json += "}";
  }
  json += "],";
  json += "\"timestamp\":" + String(millis());
  json += "}";
  server.send(200, "application/json", json);
}
void setMode(String mode) {
  bool changingToManual = (mode == "manual");
  bool changingToAuto = (mode == "auto");

  // فقط إذا تغيّر الوضع فعلياً — تجنّب إيقاف الروبوت دون ضرورة
  if ((changingToManual && !manualMode) || (changingToAuto && manualMode)) {
    move(STOP);
    isRunning = false;
    resetPIDState();

    // تصفير الوقت عند تغيير الوضع
    stopwatchValue = 0;
    startTime = 0;

    if (changingToManual) {
      manualMode = true;
      statusColor = "blue";
      Serial.println("Switched to manual mode");
      startScheduled = false;  // Cancel pending auto actions
    } else {  // changingToAuto
      manualMode = false;
      robotStatus = "Ready";
      statusColor = "green";
      Serial.println("Switched to auto mode");
    }
  }
}
void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}
void startServer() {
  // Initialize LittleFS
  if (LittleFS.begin()) {
    Serial.println("LittleFS mounted successfully");
    // List files (optional)
    File root = LittleFS.open("/");
    File file = root.openNextFile();
    while (file) {
      Serial.println(file.name());
      file = root.openNextFile();
    }
  }

  // Start WiFi AP
  WiFi.softAP("Sonic", NULL);
  IPAddress myIP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(myIP);
  // Handle static files from LittleFS
  server.serveStatic("/index.html", LittleFS, "/index.html");
  server.serveStatic("/manual.html", LittleFS, "/manual.html");
  server.serveStatic("/icon.png", LittleFS, "/icon.png");
  server.serveStatic("/Electrolise.ttf", LittleFS, "/Electrolise.ttf");
  server.serveStatic("/logo.svg", LittleFS, "/logo.svg");
  server.serveStatic("/background.svg", LittleFS, "/background.svg");

  server.onNotFound(handleNotFound);

  // Set up server routes
  server.on("/", handleRoot);
  server.on("/startstop", handleStartStop);
  server.on("/manual", handleManualControl);
  server.on("/forward", []() {
    if (manualMode) move(FORWARD);
    server.send(200);
  });
  server.on("/backward", []() {
    if (manualMode) move(BACKWARD);
    server.send(200);
  });
  server.on("/left", []() {
    if (manualMode) move(LEFT);
    server.send(200);
  });
  server.on("/right", []() {
    if (manualMode) move(RIGHT);
    server.send(200);
  });

  server.on("/stop", []() {
    move(STOP);
    server.send(200);
  });
  server.on("/clearhistory", HTTP_POST, []() {
    clearHistory();
    server.send(200, "application/json", "{\"success\":true}");
  });
  server.on("/status", handleStatus);
  server.on("/resetpid", resetPID);
  server.on("/setpid", handleSetPID);
  server.on("/horn", []() {
    if (server.hasArg("state")) {
      if (server.arg("state") == "on") {
        digitalWrite(BUZZER_PIN, HIGH);
      } else {
        digitalWrite(BUZZER_PIN, LOW);
      }
    }
    server.send(200);
  });
  server.on("/syncmode", []() {
    String requestedMode = server.arg("mode");
    if (requestedMode == "auto") {
      setMode("auto");
    } else if (requestedMode == "manual") {
      setMode("manual");
    }
    server.send(200, "text/plain", "Mode: " + requestedMode);
  });
  server.on("/turnRight90", []() {
    if (manualMode) {
      turnRight90();
      server.send(200, "application/json", "{\"success\":true}");
    } else {
      server.send(200, "application/json", "{\"success\":false}");
    }
  });

  server.on("/turnLeft90", []() {
    if (manualMode) {
      turnLeft90();
      server.send(200, "application/json", "{\"success\":true}");
    } else {
      server.send(200, "application/json", "{\"success\":false}");
    }
  });

  server.on("/cw", []() {
    if (manualMode) move(ROTATE_CW);
    server.send(200);
  });

  server.on("/ccw", []() {
    if (manualMode) move(ROTATE_CCW);
    server.send(200);
  });
  robotStatus = "Ready";
  statusColor = "green";
  server.begin();
  Serial.println("HTTP server started");
}
void setup() {
  // Initialize pins
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);  //left motor
  pinMode(ENB, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);  //right motor

  for (int i = 0; i < 5; i++) pinMode(sensorPins[i], INPUT);  // Initialize sensor pins as inputs

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);  // Configure button, buzzer and Built in LED
  //---------------------------------------------------------//
  LoadDefaultValues();
  move(STOP);  // Start With Motors Stopped

  Serial.begin(115200);
  Serial.println("ESP32 Path Following Robot");  // Initialize serial for debugging
  startServer();
  beep(200);
  delay(200);
  beep(200);  // Startup beep

  digitalWrite(LED_PIN, LOW);
}
void loop() {
  server.handleClient();  // Handle web server requests
  updateLedStatus();      // Update LED indicators
  handleStartTrigger();   // Handle button press logic

  // Main line following control
  if (!manualMode && isRunning) {
    FollowPathPID();    // Call the line following algorithm
    updateStopwatch();  // Update timer only when running
  }

  delay(5);  // Small delay to prevent watchdog triggers
}
