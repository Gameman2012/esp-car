## المراحل

| # | المرحلة | الملف | الحالة | تعريف «خلصت» |
|---|---------|-------|--------|----------------|
| ① | **قراءة** | — |⏳تم تأجيله | كل الكود والواجهات اتقرأت وفُهمت |
| ② | **تعديل** | [`عدل/modifications.md`](عدل/modifications.md) | تم | البنود **1–16** منفَّذة + Compile |
| ③ | **ترتيب** | [`رتب/functions-order.md`](رتب/functions-order.md) | ✅ | البند **17** منفّذ + عدد الدوال نفسه (34) + معالجة ملاحظات م1، م2 في index.html + تقسيم JS إلى scripts/auto.js و scripts/manual.js مع DFSorder |
| ④ | **تعريب** | [`عرب/arabization.md`](عرب/arabization.md) | تم | البند **18** منفّذ + RTL سليم |
| ⑤ | **تشطيب** | [`تشطيب/finishing.md`](تشطيب/finishing.md) | ⏳ | **توثيق** (PDF) + **تطبيق** على السيارة |

---
## خطة Git

| # | Commit | المرحلة |
|---|--------|---------|
| 0 | `chore: normalize line endings + docs` | تجهيز |
| 1 | `refactor: apply quick fixes (10-14, 16)` | ②أ |
| 2 | `refactor: unify robot state enum (15)` | ②ب |
| 3 | `chore: unify default PID values (19)` | ②ج |
| 4 | `refactor: reorder functions by call-graph DFS` | ③ |
| 5 | `feat(ui): Arabize interface (RTL)` | ④ |
| 6 | `docs: final documentation + application` | ⑤ |

---

## ملاحظات
- **الـ PDFs** في `ملفات/` تُحذف/تُستثنى قبل الرفع.
