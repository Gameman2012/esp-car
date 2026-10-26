# خطة إعادة تنظيم JavaScript — مشروع ALEXU Automatic Control

## الهدف
تقسيم JavaScript من `data/index.html` و `data/manual.html` إلى ملفين منفصلين (`auto.js`، `manual.js`)، وتطبيق نفس مبادئ إعادة الترتيب المطبقة على ملف `.ino` (Preorder DFS + ترتيب حسب أول استدعاء)، مع **الإبقاء على اسم `initializePage` كما هو** في كل ملف.

---

## النطاق (Scope)

| الملف المصدر | عدد الدوال الحالية | الملف الجديد |
|--------------|-------------------|-------------|
| `data/index.html` | 22 دالة | `scripts/auto.js` |
| `data/manual.html` | 24 دالة | `scripts/manual.js` |

**لا يوجد دمج بين الملفين.** كل ملف مستقل عن الآخر، وكل صفحة HTML تحمل ملفها الخاص فقط.

### الدوال المكررة بين الملفين
| الدالة | الملاحظة |
|-------|---------|
| `initializePage()` | موجودة في الملفين — **يبقى اسمها كما هو**، كل ملف Gets نسخته الخاصة لأن كل صفحة تحمل ملفها فقط، ولا يوجد تداخل بين الصفحين. |
| `updateTimerDisplay()` | معرفة مرتين داخل `index.html` — تُدمج لنسخة واحدة في `auto.js` فقط. |
| `startSpeedSync()` | في `index.html` كانت تُشير لـ `#speedSlider` غير موجود (دالة ميتة) — تُحذف من `auto.js` وتُصلح في `manual.js` لتعمل على `#speedSlider`. |

---

## متطلبات ما قبل النقل (Prerequisites)

قبل إنشاء ملفات `.js`، يجب تعديل `Control_Project_Final_Code.ino`:

1. **إضافة route لخدمة مجلد `scripts/`** داخل `startServer()`:
   ```cpp
   server.serveStatic("/scripts/", LittleFS, "/scripts/");
   ```
   بدون هذا، المتصفح لن يستطع تحميل `/scripts/auto.js` أو `/scripts/manual.js` وسيحصل على 404.

2. **إصلاح CRLF/LF** في `.ino` قبل أي commit، حتى يكون diff مقروءًا وغير مزدحم بتغييرات نهاية السطر.

---

## 구조 كل ملف (مثل ملف `.ino`)

يتم تطبيق **Preorder DFS First Mention** داخل كل ملف على حدة: كل دالة تُعرف عند أول استدعاء فعلي لها داخل مسار DFS الخاص بذلك الملف.

### 1. Section A — المتغيرات والثوابت (في الأعلى)

`auto.js`:
```javascript
const STOPWATCH_UPDATE_INTERVAL = 100;
const STATUS_POLL_INTERVAL = 300;
let running = false;
let statusUpdateInterval;
let latestServerTime = 0;
let lastStopwatchUpdate = 0;
let currentValues = { speed: 35, kp: 35, ki: 0.05, kd: 25, turnDelay: 250 };
let startTime = 0, elapsedTime = 0, timerInterval = null, isTimerRunning = false;
let currentTriggerMode = "web";
let pendingUpdates = {};
let isUpdating = false;
```
> محذوف: `speedSyncInterval` (كان يُستخدم فقط في `startSpeedSync` التي حُذفت)، `lockedTriggerMode`، `lockedStatus` (غير مستخدمة).

`manual.js`:
```javascript
let use90DegreeTurns = false;
let activeButtons = new Set();
let keyboardActiveButtons = new Set();
let touchActiveButtons = new Set();
let hornActive = false;
let rotationInProgress = false;
let currentMode = "manual";
const touchPoints = new Map();
let speedSyncInterval;
```
> محذوف: `loadSpeedFromStorage()` (منطقية مكررة مع ما تفعله `initializePage` مباشرة).

### 2. Section B — دوال المساعدة (Helper Functions)
تُرتّب حسب **Preorder DFS** (كل دالة تُعرف قبل أول استدعاء لها).

`auto.js`:
1. `setupSlider(sliderId, valueId)` — مع إصلاح `param naming` (`turnDelay` وليس `turndelay`)
2. `scheduleUpdate()`
3. `sendUpdateImmediately(specificUpdate)`
4. `updateSliderValue(sliderId, value)`
5. `updateScrollBehavior()`
6. `updateTimerDisplay(milliseconds)` — نسخة واحدة فقط (تمت إزالة التكرار)

`manual.js`:
1. `startSpeedSync()` — مصححة لتعمل على `#speedSlider` (الموجود في manual.html فقط)
2. `setupButton(buttonId, direction)`
3. `adjustSpeed(change)`
4. `updateSlider()` (اليدوية)

### 3. Section C — معالجات الأحداث (Event Handlers)

`auto.js`:
- `updateStatusFromServer()`
- `updateStatusDisplay(data)`
- `updateButtonState(status)`
- `updateTriggerMode(mode)`
- `updateHistoryTable(history)`

`manual.js`:
- `handleKeyDown(event)`
- `handleKeyUp(event)`
- `handleTouchStart(event, direction)`
- `handleTouchEnd(event)`
- `handleTouchRotation(direction, isPressed)`
- `touchMove(event, direction)`

### 4. Section D — دوال التحكم (Control / Movement)

`auto.js`:
- `toggleRobot()`
- `resetToDefaults()`
- `clearHistory()`
- `sendCurrentSettingsToServer()`
- `switchToManual()`

`manual.js`:
- `handleButtonPress(direction, isPressed)`
- `handleRotation(direction, isPressed)`
- `determineAndExecuteMovement()`
- `toggle90TurnMode()`
- `activateHorn()`, `deactivateHorn()`, `touchHorn(event, state)`

### 5. Section E — `initializePage()` (بدل `setup()` في INO)
**لا يُغيّر اسمها.** كل ملف Gets نسخته الخاصة لأن كل صفحة تحمل ملفها فقط.

`auto.js` — `initializePage()`:
- تهيئة favicon
- Setup sliders للمودال (speedSliderModal, kpSlider, kiSlider, kdSlider, turnDelaySlider)
- إضافة event listener لزر `showInfoButton`
- بدء تحديثات الحالة: `statusUpdateInterval = setInterval(updateStatusFromServer, STATUS_POLL_INTERVAL)`
- `fetch("/syncmode?mode=auto")`

`manual.js` — `initializePage()`:
- تهيئة favicon
- تحميل السرعة من `localStorage` (مباشرة داخل الدالة، بدون `loadSpeedFromStorage`)
- `setManualMode()`
- Setup الأزرار: `setupButton('forward', ...)` إلخ
- تهيئة Checkbox 90°
- `fetch("/syncmode?mode=manual")`
- إضافة event listeners: `keydown` و `keyup`
- جلب الحالة الأولية `/status`
- استدعاء `startSpeedSync()` (مُصلحة)

### 6. Section F — تحديثات الحالة المستمرة (بدل `loop()`)
في JavaScript، تُستبدل `loop()` بـ `setInterval` داخل `initializePage`:
- `auto.js`: `setInterval(updateStatusFromServer, STATUS_POLL_INTERVAL)` — تحديث تلقائي كل 300ms.
- `manual.js`: `startSpeedSync()` — مزامنة السرعة كل ثانيتين.

---

## Bug Fixes المرفقة بالخطة

| # | البug | الملف المتأثر | الحل |
|---|-------|--------------|------|
| M1 | `startSpeedSync()` تشير لـ `#speedSlider` غير موجود في `index.html` | `auto.js` | تُحذف من `auto.js` (لا داعي لها في وضع التلقائي) وتُصلح في `manual.js` لتعمل على `#speedSlider` |
| M2 | `updateTimerDisplay()` معرفة مرتين في `index.html` | `auto.js` | تُدمج لنسخة واحدة فقط |
| M3 | `param naming bug`: `turndelay` بدلاً من `turnDelay` | `auto.js` و `manual.js` | تُصلح في `setupSlider` داخل كل ملف |
| M4 | `initializePage` متكررة بين الملفين | كلا الملفين | يُحتفظ بالاسم كما هو، كل ملف Gets نسخته الخاصة المخصصة لوضعه |
| M5 | `loadSpeedFromStorage()` مكررة مع منطق `initializePage` | `manual.js` | تُحذف، والمنطق ينقل مباشرة إلى `initializePage` |

---

## خطوات التنفيذ

1. **تعديل `.ino`**: إضافة `server.serveStatic("/scripts/", LittleFS, "/scripts/");` داخل `startServer()`.
2. **إصلاح CRLF/LF** في `.ino` قبل أي commit.
3. **إنشاء مجلد `scripts/`** داخل `Control_Project_Final_Code/`.
4. **إنشاء `scripts/auto.js`** بنقل دوال `index.html` وفقًا لـ Section A–F أعلاه، مع تطبيق Bug Fixes M1–M4.
5. **إنشاء `scripts/manual.js`** بنقل دوال `manual.html` وفقًا لـ Section A–F أعلاه، مع تطبيق Bug Fixes M1–M5.
6. **تحديث `data/index.html`**: استبدال الكتلة `<script>...</script>` الداخلية بـ:
   ```html
   <script src="/scripts/auto.js"></script>
   ```
7. **تحديث `data/manual.html`**: استبدال الكتلة `<script>...</script>` الداخلية بـ:
   ```html
   <script src="/scripts/manual.js"></script>
   ```
8. التأكد من أن الجملة `document.addEventListener("DOMContentLoaded", initializePage);` تظل في كل HTML وتستدعي الدالة من الملف المشمول.
9. اختبار على ESP32: `/status`، `/startstop`، `/setpid`، `/syncmode` تعمل كما قبل.
10. **Commit مستقل** بعنوان مثل: `refactor: split JS into auto.js and manual.js with DFS ordering`

---

## مقاييس النجاح (Definition of Done)

- [ ] `scripts/auto.js` يحتوي على جميع دوال `index.html` بدون فقدان.
- [ ] `scripts/manual.js` يحتوي على جميع دوال `manual.html` بدون فقدان.
- [ ] اسم الدالة `initializePage` لم يتغير في أي ملف.
- [ ] لا يوجد تكرار لـ `updateTimerDisplay` داخل `auto.js`.
- [ ] `startSpeedSync` لا تشير لعناصر DOM غير موجودة في `auto.js` (محفوفة أو مُصلحة).
- [ ] `index.html` و `manual.html` تختزان فقط `<script src="/scripts/auto.js">` و `<script src="/scripts/manual.js">` على التوالي.
- [ ] تمت إضافة `server.serveStatic("/scripts/", ...)` في `.ino`.
- [ ] تم إصلاح CRLF/LF قبل commit.
- [ ] Commit منفصل لهذه المرحلة.
- [ ] (اختياري، مرحلة لاحقة) الخط العربي يأتي في مرحلة التعريب (المرحلة ④)، ليس جزءًا من هذه الخطة.

---