# خطة شرائح HTML (Slideshow)

> ملف HTML واحد مستقل (`flowchart.html`) يشرح تدفق الكود بشكل تفاعلي.
> الفكرة: **شارت عام بمربعات لكل الدوال** + **شريحة تفصيلية لكل دالة من صنعنا**.

---

## المبدأ (DFS)

1. **شريحة عامة**: الشارت الكامل بمربعات لكل الدوال.
2. **الدوال Built-in** (مثل `pinMode`، `digitalRead`، `analogWrite`، `millis`):
   - مربع داخل الشارت + **شرح مختصر فقط**.
   - تُشرح أيضاً داخل شريحة الدالة الأم (بدون شريحة مستقلة).
3. **الدوال من صنعنا**:
   - شرح **مبسط** داخل مربع الشارت + إشارة «→ شريحة X».
   - **شريحة تفصيلية** مخصصة.
4. **الاجتياز**: `setup()` → الدوال المتداخلة → `loop()` → الدوال المتداخلة.

---

## عناصر الواجهة

- تنقّل بالأسهم (← →) + أزرار Prev/Next.
- **Breadcrumb** يوضح المسار: `setup → startServer → handleSetPID`.
- تمييز لوني: Built-in / من صنعنا.
- شريط تقدّم (Progress bar).
- تصميم متجاوب (يعمل على الموبايل والكمبيوتر).

---

## هيكل الشرائح المقترح (مبدئي — قابل للتعديل)

| # | الشريحة | النوع | المحتوى | المسار |
|---|---------|-------|---------|--------|
| 1 | الشارت العام | نظرة عامة | مربعات لكل الدوال + Legend | — |
| 2 | `setup()` | من صنعنا | `pinMode` / `INPUT_PULLUP` / `Serial` (built-in) | `setup` |
| 3 | `LoadDefaultValues()` | من صنعنا | Preferences والقيم الافتراضية | `setup → LoadDefaultValues` |
| 4 | `move()` | من صنعنا | `enum Movement` والاتجاهات | `setup → move` |
| 5 | `setMotorSpeeds()` | من صنعنا | `IN1–IN4` + PWM (`analogWrite`) | `move → setMotorSpeeds` |
| 6 | `beep()` | من صنعنا | مساعدة صغيرة | `setup → beep` |
| 7 | `startServer()` | من صنعنا | جدول المسارات (Routes) | `setup → startServer` |
| 8 | `loop()` | من صنعنا | تدفق الحلقة الرئيسية | `loop` |
| 9 | `updateLedStatus()` | من صنعنا | حالات الـ LED | `loop → updateLedStatus` |
| 10 | `handleStartTrigger()` | من صنعنا | الزر + التشغيل المؤجّل | `loop → handleStartTrigger` |
| 11 | `startRobot()` | من صنعنا | بدء الجولة | `handleStartTrigger → startRobot` |
| 12 | `stopRobot()` | من صنعنا | الإيقاف + Trigger Mode | `handleStartTrigger → stopRobot` |
| 13 | `FollowPathPID()` | من صنعنا | قراءة الحساسات + الأوزان + `error` | `loop → FollowPathPID` |
| 14 | حساب PID | تفصيل | `integral` / `derivative` / `correction` | `FollowPathPID` |
| 15 | سرعات الموتور | تفصيل | `speedL` / `speedR` + `constrain` | `FollowPathPID` |
| 16 | `readSensors()` | من صنعنا | قراءة الحساسات الخمسة | `FollowPathPID → readSensors` |
| 17 | `detect90()` | من صنعنا | كشف المنعطفات | `FollowPathPID → detect90` |
| 18 | `turnLeftdetection()` / `turnRightdetection()` | من صنعنا | المسح بالحساسات | `detect90 → ...` |
| 19 | `endProcedure()` | من صنعنا | إنهاء الجولة | `FollowPathPID → endProcedure` |
| 20 | `updateStopwatch()` | من صنعنا | العدّاد | `loop → updateStopwatch` |
| 21 | `addRoundToHistory()` / `clearHistory()` | من صنعنا | سجل الجولات | `stopRobot / endProcedure` |
| 22 | `handleStartStop()` | من صنعنا | بدء/إيقاف عبر الويب | `startServer` |
| 23 | `handleStatus()` | من صنعنا | JSON الحالة | `startServer` |
| 24 | `handleSetPID()` / `resetPID()` | من صنعنا | ضبط الإعدادات | `startServer` |
| 25 | `setMode()` | من صنعنا | Auto / Manual | `startServer` |
| 26 | المسارات اليدوية | من صنعنا | forward / backward / left / right / cw / ccw / horn | `startServer` |
| 27 | المخطط الكامل | ختام | Full Flowchart | — |
| 28 | خريطة الملف | ختام | أين كل جزء في الـ `.ino` | — |

---

## ملاحظات التنفيذ

- الشريحة 1 أساسية: تعطي الصورة الكبيرة قبل الدخول في التفاصيل.
- الشرائح 14 و15 قد تُدمجان في شريحة واحدة إذا كانت طويلة.
- المسارات اليدوية (26) قد تُدمج في شريحة واحدة.
- Built-in تُشرح داخل الشرائح، ولا تأخذ شرائح مستقلة.
- يُفضّل أن يحتوي كل مربع «من صنعنا» على رابط/إشارة إلى شريحته.
