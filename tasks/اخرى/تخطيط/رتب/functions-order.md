# خطة إعادة ترتيب الدوال — `Control_Project_Final_Code.ino`

> **الحالة:** ✅ معتمد — **البند 17** في `/عدل/modifications.md`.
> **التنفيذ:** بعد البنود **1–16** من `عدل/modifications.md` و**قبل** التعريب (البند 18 — `عرب/arabization.md`)، وفي **commit مستقل**. 

---

## 1) المبدأ

```
A. الهيدر الثابت   →  المكتبات · الثوابت · الأنواع · المتغيرات العامة
B. نقطة الدخول     →  setup() · loop()
C. الطبقة المشتركة  →  الدوال متعددة الاستخدام (تُذكر قبل DFS)
D. شجرة setup      →  DFS بالترتيب المنطقي
E. شجرة loop       →  DFS بالترتيب المنطقي
```

**قاعدة DFS:** ترتيب أول ذكر (Preorder) — أي الدالة تُعرَّف بعد أول استدعاء فعلي لها، مع الاستثناءات المذكورة في القسم 4.

---

## 2) الترتيب الكامل المقترح

### A) الهيدر الثابت (لا يتغير ترتيبه)

| # | المحتوى | الأسطر الحالية |
|---|---------|----------------|
| 1 | `#include` + `#define FS` + `Preferences preferences` | 1–8 |
| 2 | ثوابت الأطراف: `sensorPins[]` · `ENA/IN1/IN2/ENB/IN3/IN4` · `BUZZER/BUTTON/LED` | 10–12 |
| 3 | ثوابت PID: `Kp` · `Ki` · `Kd` | 14 |
| 4 | المتغيرات العامة: `manualMode` · `speedPercentage` · `robotStatus` · `statusColor` · `sensorReadings[]` · `turnDelay` · `motorSpeed` · `turnDelayMs` … | 17–27 |
| 5 | حالة PID: `lastError` · `integral` · `Imax` | 37–40 |
| 6 | حالة الروبوت: `isRunning` · `startScheduled` · `startTime` · `stopwatchValue` · `startTriggerMode` … | 41–54 |
| 7 | `enum Movement` | 55–63 |
| 8 | `struct RoundRecord` + `roundHistory[10]` + `currentRound` + `historyCount` | 65–74 |
| 9 | `WebServer server(80)` | 76–77 |

> 🗑️ **يُحذف قبل إعادة الترتيب:** الأسطر 28–35 (المتغيرات الميتة) — **البند 1**.

> ➕ **يُضاف:** `enum RobotState` — **البند 15** — يُوضع بجوار `enum Movement` (النوعان قبل أي استخدام). كما يُضاف `resetPIDState()` — **البند 8** — في الطبقة المشتركة (القسم C).

---

### B) نقطة الدخول

| # | الدالة | الأسطر الحالية | ملاحظة |
|---|--------|----------------|--------|
| 10 | `setup()` | 767–793 | أول ما يُقرأ |
| 11 | `loop()` | 794–806 | ثاني ما يُقرأ |

---

### C) الطبقة المشتركة (متعددة الاستخدام)

> الفكرة التي اقترحتها: أي دالة تُستخدم من **أكثر من شجرة** تُرفع هنا، قبل DFS.

| # | الدالة | الأسطر | عدد المستدعين | المستدعون |
|---|--------|--------|----------------|------------|
| 12 | `move()` | 464–490 | 8+ | setup · FollowPathPID · detect90 · turn* · manual routes · setMode · stopRobot · endProcedure |
| 13 | `setMotorSpeeds()` | 440–463 | 5 | move · FollowPathPID · detect90 · turn*detection · turn*90 |
| 14 | `readSensors()` | 596–598 | 6 | FollowPathPID · detect90 · handleStartStop · turn*detection · turn*90 |
| 15 | `beep()` | 491–496 | 4 | setup · startRobot · stopRobot · endProcedure |
| 16 | `addRoundToHistory()` | 526–550 | 2 | stopRobot (setup) · endProcedure (loop) |
| 17 | `resetPIDState()` *(جديد — البند 8)* | — | 3 | stopRobot · setMode · resetPID (البند 13) |

**لماذا لم نرفع `clearHistory()`؟** لأنها تُستخدم من مسار واحد فقط (`/clearhistory`) → تبقى في شجرة setup.

---

### D) شجرة `setup()` — DFS

| # | الدالة | الأسطر الحالية | سبب الموضع |
|---|--------|----------------|-------------|
| 18 | `LoadDefaultValues()` | 307–323 | أول استدعاء في setup |
| 19 | `startServer()` | 659–766 | ثاني استدعاء |
| 20 | `handleRoot()` | 561–565 | أول Route مسجّل |
| 21 | `handleManualControl()` | 566–570 | ثاني Route |
| 22 | `handleStartStop()` | 571–595 | أول معالج فعلي |
| 23 | `startRobot()` | 325–340 | يُنادى من handleStartStop |
| 24 | `stopRobot()` | 341–384 | يُنادى من handleStartStop |
| 25 | `handleStatus()` | 609–639 | Route مستقل |
| 26 | `handleSetPID()` | 227–291 | مجموعة الإعدادات |
| 27 | `resetPID()` | 292–306 | مرتبط بـ handleSetPID |
| 28 | `setMode()` | 640–655 | مجموعة الأوضاع |
| 29 | `clearHistory()` | 551–559 | Route مستقل |
| 30 | `turnLeft90()` | 201–209 | مسارات اللف 90° |
| 31 | `turnRight90()` | 211–219 | زوج turnLeft90 |
| 32 | `handleNotFound()` | 656–658 | fallback في آخر مجموعة الويب |


---

### E) شجرة `loop()` — DFS

| # | الدالة | الأسطر الحالية | سبب الموضع |
|---|--------|----------------|-------------|
| 33 | `updateLedStatus()` | 497–525 | أول استدعاء في loop |
| 34 | `handleStartTrigger()` | 416–439 | ثاني استدعاء |
| 35 | `FollowPathPID()` | 79–116 | جوهر الخوارزمية |
| 36 | `endProcedure()` | 385–415 | أول استدعاء داخل FollowPathPID |
| 37 | `detect90()` | 117–167 | ثاني استدعاء داخل FollowPathPID |
| 38 | `turnLeftdetection()` | 170–184 | زوج المسح |
| 39 | `turnRightdetection()` | 186–200 | زوج المسح |
| 40 | `updateStopwatch()` | 220–226 | آخر استدعاء في loop |

---

## 3) ما الذي سيُحذف قبل الترتيب؟

| المصدر | المحذوف |
|--------|---------|
| **البند 1** | المتغيرات الميتة (أسطر 28–35) |
| **البند 3** | `turnDelayMs` كلياً (التعريف + سطر 251 + أسطر 302–303) |
| **البند 4** | `motorSpeed` |
| **البند 5** | `manualStop` |
| **البند 6** | `handleSpeed()` + `server.on("/speed", ...)` |
| **البند 9** | إعادة هيكلة `handleSetPID()` بالدوال المساعدة — **يشمل** `end()` مرة واحدة + `constrain` لـ kp/ki/kd |
| **البند 8** | إضافة `resetPIDState()` (لا حذف) |

> ملاحظة: `statusColor` **بقي كما هو** — اعتُمد إبقاءه (لا حذف ولا استبدال) في هذه الجولة. إن اعتُمد حذفه لاحقاً يُحذف من الهيدر ومن `handleStatus()`.

---

## 4) الاستثناءات المعتمدة

| # | الاستثناء | السبب |
|---|-----------|-------|
| 1 | الأنواع (`enum` / `struct`) أولاً | لا يمكن استخدامها قبل تعريفها |
| 2 | تجميع مسارات الويب بالميزة | ترتيب `server.on` الحالي غير منطقي معنوياً |
| 3 | إبقاء الأزواج ملتصقة | `turnLeft/turnRight` · `start/stopRobot` · `setMotorSpeeds/move` |
| 4 | رفع الدوال المشتركة قبل DFS | اقتراحك — يقلل التشتت |
| 5 | `handleNotFound` آخر مجموعة الويب | طبيعتها fallback |

---

## 5) خطوات التنفيذ

```
0. تطبيق البنود 1–16 من `عدل/modifications.md` (مع حسم البند 19 إن أمكن)
        ↓
1. Commit #1 — التعديلات
        ↓
2. إعادة الترتيب (البند 17) — كتابة الملف بنفس الاسم بالترتيب الجديد
        ↓
3. التحقق:
   • Compile (Arduino IDE / arduino-cli)
   • عدد الدوال قبل/بعد متساوٍ (ناقص المحذوف)
   • عدد المسارات قبل/بعد متساوٍ (ناقص /speed)
   • اختبار سريع: /status · /startstop · /setpid · /syncmode
        ↓
4. Commit #2 — الترتيب
        ↓
5. التعريب (البند 18) — Commit #3 — `عرب/arabization.md`
        ↓
6. التشطيب (توثيق + تطبيق) — Commit #4 — `/تشطيب/finishing.md`
```

> ⚠️ **Git:** إعادة الترتيب ستُحدث diff ضخماً — لذلك تُنفَّذ في **commit مستقل** بعنوان واضح مثل:
> `refactor: reorder functions by call-graph DFS + shared layer`

---

## 6) قائمة تحقق ما قبل الـ Compile

- [ ] كل `enum`/`struct` معرّف قبل أول استخدام — بما فيها `enum RobotState` الجديد (البند 15).
- [ ] كل دالة تُستخدم داخل `startServer` lambdas معرّفة أو لها prototype.
- [ ] لا تكرار لأسماء الدوال.
- [ ] `resetPIDState()` معرّفة قبل `stopRobot()` و`setMode()` و`resetPID()`.
- [ ] `addRoundToHistory()` معرّفة قبل `stopRobot()` و`endProcedure()`.
- [ ] `move()` معرّفة قبل أي دالة تستخدمها.
- [ ] لا أسطر ميتة متبقية (`prepare90` · `isTurning` · `turnTimeout` · `motorSpeed` · `manualStop` · `turnDelayMs` …).
- [ ] لا آثار لـ `/speed` في `startServer`.

---

## 7) أثر الترتيب على التوثيق

| العنصر | الأثر |
|--------|-------|
| `flowchart.html` | ترتيب الشرائح الحالي قريب من الترتيب الجديد؛ قد نضيف شريحة فاصلة «الطبقة المشتركة» ونعيد ترقيم 4–6 |
| `modifications.md` | البند 17 هو هذا الملف — التنفيذ هنا |
| `tasks.md` | المرحلة ③ «ترتيب» |
| PDF النهائي | يسهل ربط «رقم الشريحة ↔ ترتيب السطر» |
