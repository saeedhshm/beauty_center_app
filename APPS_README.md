# لمسة — Flutter Apps Roadmap for AI Agents

تاريخ الوثيقة: 2026-10-12

هذه الوثيقة خطة تنفيذ منضبطة لتطبيقَي «لمسة»: تطبيق العميلة وتطبيق الخبيرة. صيغت لتُستخدم بواسطة Codex أو أي AI coding agent مرحلةً بمرحلة، مع نطاق واضح ومعايير قبول تمنع التوسع غير المطلوب.

## 1. قواعد التشغيل الإلزامية للـAgent

1. اقرأ `AGENTS.md` و`ROADMAP_README.md` وهذه الوثيقة كاملة قبل أي تعديل.
2. اقرأ `BACKEND_README.md` وعقد OpenAPI والـschema والـmigrations عندما تؤثر المهمة على API أو قواعد العمل.
3. اقرأ `PROJECT_STATUS.md` إن وجد، ثم افحص الكود وGit والاختبارات للتحقق منه؛ الكود والاختبارات هما الدليل الفعلي.
4. نفّذ **مرحلة واحدة فقط** عندما يطلب المستخدم رقمها. لا تبدأ المرحلة التالية، ولا تنفّذ تحسينات اختيارية خارج نطاقها.
5. افحص الموجود قبل إنشاء مشروع أو ملف أو dependency جديد. حافظ على المعمارية المناسبة وإدارة الحالة وعميل الشبكة الموجودين.
6. إذا كانت المرحلة Audit أو قراءة، لا تعدّل الملفات. إذا كانت مرحلة تنفيذ، نفّذ نطاقها ومعايير قبولها واختباراتها فقط.
7. لا تعدّل قاعدة البيانات أو Backend من مهمة تطبيقات الموبايل. إذا احتاجت الشاشة endpoint غير موجود، وثّق العقد المقترح والفجوة، ولا تستبدله بمنطق مالي أو صلاحيات داخل التطبيق.
8. لا تستخدم Mock أو Fixture في build إنتاجي. ميّز بوضوح بين UI تجريبية وتكامل API حقيقي.
9. لا تعمل commit أو push أو deploy أو إصدار متجر إلا بطلب صريح أو تعليمات مستودع واضحة.
10. عند نهاية المرحلة: شغّل الفحوص المتاحة، حدّث `PROJECT_STATUS.md` بالنتائج الفعلية، وقدّم ملخصًا يشمل الملفات والتكامل والاختبارات والعوائق. لا تضع المرحلة التالية كمنفّذة.

### بوابة الخروج من كل مرحلة

لا تعتبر المرحلة مكتملة إلا إذا تحققت كل النقاط التالية:

- سلوك المرحلة يعمل بالبيانات الحقيقية إذا كان Backend المطلوب جاهزًا.
- حالات loading وempty وerror وunauthorized/forbidden مغطاة حيث تنطبق.
- أضيفت اختبارات السلوك المهمة وشُغّلت بنجاح، أو وُثّق عائق بيئي محدد.
- لم تُدخل أسرار أو بيانات شخصية أو قواعد أعمال حساسة إلى التطبيق.
- تم تحديث وثائق العقود والحالة إذا تغيّر السلوك.
- لم تُنفّذ عناصر المرحلة التالية ضمنيًا.

## 2. فكرة التطبيقين ونطاق الـMVP

«لمسة» منصة لحجز خدمات التجميل المنزلية في القاهرة. تختار العميلة خدمة وخبيرة وموعدًا وعنوانًا، وترسل طلبًا. تقبله الخبيرة أو ترفضه. بعد القبول تدفع العميلة، فيتحول الحجز إلى مؤكد. وبعد تنفيذ الخدمة يُستكمل الحجز ويصبح التقييم متاحًا.

الأدوار:

| التطبيق | الدور | المسؤوليات الأساسية |
| --- | --- | --- |
| تطبيق العميلة | `customer` | الاستعراض، العناوين، اختيار الموعد، الحجز، الدفع، المتابعة والتقييم |
| تطبيق الخبيرة | `expert` | الملف والخدمات والأسعار، التوفر، قبول الطلبات أو رفضها، متابعة الحجوزات والمستحقات |
| لوحة الإدارة | `admin` | الاعتماد والإدارة والمتابعة؛ خارج تنفيذ هذه الوثيقة |

نطاق الإطلاق:

- مدينة واحدة أولًا، والمدينة الفعلية تحتاج أن تأتي من إعداد المنتج أو API.
- العملة `EGP` وتوقيت الأعمال والعرض `Africa/Cairo`.
- حجز واحد = خبيرة واحدة + خدمة واحدة + موعد واحد + عنوان واحد.
- مدة الخدمة على مستوى `services`، والسعر على مستوى خدمة الخبيرة.
- تطبيقان Flutter منفصلان هو الاقتراح للمشروع الجديد، مع Packages مشتركة بقدر مفيد. إذا كان المستودع يستخدم تطبيقًا واحدًا أو بنية أخرى مناسبة، لا تعِد كتابته قبل تقرير أثر وموافقة المستخدم.

## 3. مصدر الحقيقة وحدود مسؤولية التطبيقات

Backend هو مصدر الحقيقة في:

- هوية المستخدم ودوره وحالة الحساب واعتماد الخبيرة.
- الخدمات والأسعار والمدة والتوفر والـSlots.
- حالات الحجز وانتقالاتها والمهل والصلاحيات.
- العنوان المملوك للعميلة ولقطة العنوان داخل الحجز.
- السعر والعمولة والضريبة والإجمالي والعملة والمستحقات.
- نتيجة الدفع والاسترجاع والتحويلات والتقييمات.

تطبيقات الموبايل مسؤولة عن عرض البيانات، جمع المدخلات المسموحة، إدارة حالة الواجهة والجلسة، وطلب العمليات من API. لا تحسب السعر النهائي أو تؤكد الدفع أو تسمح بإجراء لأن زرًا ظاهر فقط.

### الحالات المعتمدة

حالات الحجز:

```text
pending, accepted, confirmed, completed, rejected, cancelled, expired
```

المسار الرئيسي:

```text
pending → accepted → confirmed → completed
```

حالات الدفع الأولية:

```text
pending, paid, failed, refunded
```

قواعد ثابتة:

- `paid` ليست حالة حجز.
- لا تضف `on_the_way` أو `in_progress` للـMVP.
- نجاح شاشة بوابة الدفع لا يساوي نجاحًا ماليًا؛ التطبيق يعيد الاستعلام من Backend.
- لا تسمح للعميلة بتعيين `confirmed` أو للخبيرة بتغيير أي حالة اعتباطيًا.
- لا تفترض ضريبة 15% أو قيمة ضريبة ثابتة أو معادلة مالية لم يعتمدها Backend.

## 4. ملاحظات ملزمة على التصميم المرئي المقترح

التصميم المرجعي يعرض شاشات العميلة: الترحيب، اختيار المدينة، الرئيسية، قائمة الخبيرات، ملف الخبيرة، اختيار الموعد، تحديد الموقع، مراجعة الحجز، طرق الدفع، نجاح الطلب، تفاصيل الحجز والتقييم.

التصميم مصدر UI/UX، لكنه لا يتجاوز قرارات المنتج التالية:

| ما يظهر في التصميم | التطبيق الصحيح للـMVP |
| --- | --- |
| الدفع قبل موافقة الخبيرة | أرسل `pending` أولًا؛ بعد `accepted` يظهر الدفع؛ وبعد نجاح موثوق يصبح `confirmed` |
| `في الطريق` و`بدء الخدمة` | لا تعرضهما كحالات فعلية في الـMVP |
| ضريبة 15 ريالًا على سعر 300 | اعرض القيم التي يعيدها Backend فقط، ولا تثبّت المعادلة في التطبيق |
| محفظة التطبيق | مؤجلة؛ لا تعرضها دون Backend ومنتج معتمدين |
| التواصل مع الخبيرة | لا تضف Chat أو واتساب أو اتصالًا قبل حسم القناة والخصوصية |
| صور مع التقييم | مؤجلة ما لم يعتمد Backend تخزين Review Images وعقدها |
| المفضلة | مؤجلة ما لم يوجد نموذج بيانات وAPI معتمدان |
| مشاركة الحجز | اختيارية ومؤجلة عن الرحلة الأساسية |

النص الصحيح بعد إنشاء الطلب:

```text
تم إرسال طلب الحجز
سيتم إشعارك بعد رد الخبيرة
```

ولا تظهر شاشة الدفع إلا بعد قبول الخبيرة.

## 5. المعمارية المقترحة — لا تُفرض على مشروع قائم

للمشروع الجديد استخدم Feature-first مع فصل خفيف مستوحى من Clean Architecture:

```text
apps/
├── customer_app/
└── expert_app/

packages/
├── design_system/
├── networking/
├── authentication/
├── shared_models/
├── shared_widgets/
└── localization/
```

داخل Feature:

```text
features/bookings/
├── data/
│   ├── booking_api.dart
│   ├── booking_dto.dart
│   └── booking_repository_impl.dart
├── domain/
│   ├── booking.dart
│   ├── booking_repository.dart
│   └── use_cases/
└── presentation/
    ├── screens/
    ├── widgets/
    └── state/
```

قواعد المعمارية:

- افصل DTOs عن نماذج العرض عند اختلافهما، ولا تنسخ طبقات كاملة دون حاجة.
- استخدم Use Case للعمليات ذات القواعد أو التتابع المركب؛ لا تنشئ Use Case شكليًا لكل getter.
- Repository abstraction مفيد عند عزل API والاختبارات؛ لا تضع قواعد المال أو الصلاحيات داخله.
- لا تفرض Riverpod أو BLoC على مشروع قائم. في مشروع جديد اختر واحدًا ووثّق القرار، ولا تستخدم أكثر من نمط لإدارة الحالة بلا سبب.
- لا تضف Offline-first للحجوزات أو الدفع. يمكن حفظ البيانات غير الحساسة مؤقتًا لتحسين العرض، لكن العمليات الحساسة تتطلب اتصالًا وتحققًا من الخادم.
- لا تشارك بين التطبيقين قواعد تسعير أو انتقال حالة يمكن أن تختلف عن Backend.

## 6. المتطلبات المشتركة لكل الشاشات

- العربية وRTL أولًا، مع نصوص مركزية قابلة للترجمة بدل strings موزعة داخل Widgets.
- عرض التاريخ والموعد في `Africa/Cairo` مع الاحتفاظ بالقيم القياسية القادمة من API ولقطة التوقيت التاريخية للحجز.
- تنسيق `EGP` من عقد موحد، مع احترام عملة السجل التاريخية، وعدم استخدام `double` للحساب المالي داخل التطبيق.
- دعم Dynamic Type/تكبير الخط، قارئ الشاشة، contrast مناسب، touch targets وتنقل واضح.
- Loading وSkeleton عند فائدته، Empty State، Error State، Retry آمن، وحالات عدم الصلاحية.
- منع النقر المتكرر أثناء mutation، مع Idempotency Key إذا نص عليه عقد API.
- رسائل أخطاء مفهومة مبنية على error codes، لا عرض رسالة SQL أو stack trace.
- التعامل مع `401` بالتجديد المنضبط أو تسجيل الخروج، و`403` كمنع صلاحية، و`409` كتعارض يحتاج تحديث البيانات.
- عدم تسجيل tokens أو كلمات المرور أو العنوان الكامل أو بيانات الدفع في logs أو analytics.
- إعادة جلب حالة المورد بعد استئناف التطبيق أو فتح Deep Link أو الرجوع من الدفع.

## 7. خريطة شاشات تطبيق العميلة

| المجموعة | الشاشة | متطلبات أساسية |
| --- | --- | --- |
| الدخول | الترحيب والدخول وإنشاء الحساب | جلسة آمنة وأخطاء تحقق؛ طريقة التسجيل يحددها Backend |
| الاستكشاف | اختيار المدينة | المدن النشطة فقط؛ لا تثبت القاهرة أو أي مدينة أخرى في الكود |
| الاستكشاف | الرئيسية | خدمات وخبيرات متاحات دون عروض غير مدعومة |
| الاستكشاف | قائمة الخبيرات | بحث وفلترة وترتيب وpagination من الخادم |
| الاستكشاف | ملف الخبيرة | النبذة والخدمات والأسعار والمدة والمعرض والتقييمات العامة |
| العنوان | عناويني | عرض وإضافة وتعديل وحذف واختيار الافتراضي وفق API |
| العنوان | تحديد الموقع | خريطة + وصف عنوان + تحقق من المدينة؛ لا تعتمد الإحداثيات وحدها |
| الحجز | اختيار الموعد | Slots من Backend بحسب الخبيرة والخدمة والنطاق الزمني |
| الحجز | مراجعة الطلب | ملخص الخادم للسعر والمدة والعنوان قبل الإرسال |
| الحجز | نجاح الإرسال | يوضح أن الطلب ينتظر الخبيرة ولا يدّعي الدفع أو التأكيد |
| الحجز | حجوزاتي | قوائم وفلاتر بالحالات مع pagination |
| الحجز | تفاصيل الحجز | الحالة والمهلة واللقطات وسجل الحالة والإجراءات المسموحة من API |
| الدفع | الدفع ونتيجته | يظهر لحجز `accepted` فقط؛ التحقق النهائي من Backend |
| التقييم | تقييم الخبيرة | نجوم وتعليق بعد `completed`؛ الصور مؤجلة |
| عام | الإشعارات والملف | قراءة الإشعارات، Deep Links، بيانات الحساب والخروج |

## 8. خريطة شاشات تطبيق الخبيرة

| المجموعة | الشاشة | متطلبات أساسية |
| --- | --- | --- |
| الدخول | الدخول وإنشاء حساب خبيرة | جلسة آمنة ودور صحيح |
| الاعتماد | استكمال الملف | البيانات والمستندات المطلوبة من API |
| الاعتماد | حالة الاعتماد | `pending`, `approved`, `suspended` فقط بحسب الـschema الحالية |
| الرئيسية | ملخص الخبيرة | الطلبات المعلقة والحجوزات القادمة دون أرباح محلية تقديرية |
| الملف | ملفي وخدماتي | النبذة والخدمات والأسعار وحالة استقبال الطلبات |
| الملف | معرض الأعمال | رفع وترتيب وحذف بصلاحيات وروابط آمنة |
| التوفر | الجدول الأسبوعي | أيام وفترات العمل والتحقق من التداخل |
| التوفر | الاستثناءات | إجازة أو توفر إضافي بتاريخ محدد |
| الحجوزات | طلبات جديدة | `pending` الخاصة بالخبيرة فقط |
| الحجوزات | تفاصيل الطلب | قبول أو رفض وفق الحالة والمهلة؛ التعامل مع `409` |
| الحجوزات | حجوزاتي | القادمة والسابقة والحالة الحالية من الخادم |
| الحجوزات | تفاصيل حجز مؤكد | بيانات التنفيذ المسموح بها فقط وإجراء الإكمال المعتمد |
| المال | المستحقات والتحويلات | المؤهل للصرف والمصروف وتفاصيل التحويل من Backend |
| عام | التقييمات والإشعارات والحساب | تقييم العميلة بعد الإكمال، Deep Links والخروج |

لا تكشف عنوان العميلة الكامل للخبيرة قبل المرحلة التي تسمح بها سياسة الخصوصية. لا تخلط `approval_status` مع حالة الحساب أو `is_accepting`.

# 9. Roadmap التنفيذ المرحلي

الحالة الابتدائية لكل المراحل: **غير متحقق منها** إلى أن يفحص Agent المستودع ويسجل الدليل في `PROJECT_STATUS.md`.

## A0 — Audit للتطبيقات والعقود

### الهدف

معرفة الموجود فعليًا قبل إنشاء أو تعديل أي تطبيق.

### نفّذ فقط

- افحص بنية المستودع ومشاريع Flutter ونسخة Flutter/Dart والـpackages والـflavors.
- افحص `pubspec.yaml` والـlockfiles والتنقل وإدارة الحالة والشبكة والتخزين الآمن والاختبارات.
- افحص OpenAPI أو endpoints الفعلية المرتبطة بالتطبيقات.
- اربط كل شاشة في القسمين 7 و8 بحالتها: موجودة، جزئية، مفقودة، Mock، أو مربوطة بـAPI حقيقي.
- افحص Git status ولا تغيّر الملفات.
- شغّل فحوصًا غير مدمرة متاحة مثل `flutter doctor`, `flutter analyze` والاختبارات الموجودة إذا أمكن دون تغيير dependencies.

### ممنوع في A0

- إنشاء التطبيقات أو إعادة هيكلتها.
- تثبيت packages أو تعديل الكود أو الـBackend أو الداتابيس.
- اعتبار Screenshot أو README دليلًا على تنفيذ فعلي.

### معيار القبول

تقرير بأدلة ومسارات ملفات يوضح حالة التطبيقين والعقود، ثم نطاق A1 أو أول مرحلة ناقصة فقط.

### Prompt المرحلة A0

```text
Read AGENTS.md, ROADMAP_README.md, APPS_README.md, PROJECT_STATUS.md if present,
and the API documentation. Execute APPS phase A0 only.

Audit the repository, Flutter apps, packages, architecture, navigation, state
management, API client, authentication handling, environments, and tests.
Map every customer and expert screen listed in APPS_README.md to implemented,
partial, missing, mock-only, or real-API-integrated, citing file paths.

Run available non-destructive checks. Do not modify files, install packages,
change the backend/database, create apps, commit, push, or deploy.
Report conflicts, blockers, and a concrete scope for the next incomplete phase.
```

## A1 — Foundation وDesign System

### المتطلبات السابقة

- A0 مكتملة.
- قرار موثق حول تطبيقين منفصلين أو بنية المشروع الموجودة.

### نفّذ فقط

- إعداد أو استكمال التطبيقين، أو البنية القائمة التي اعتمدها المستخدم.
- إعداد dev/staging/production دون أسرار.
- API client أساسي، error mapping، timeouts، cancellation وnetwork state.
- Design tokens ومكونات الأزرار والحقول والبطاقات والحالات العامة.
- RTL وlocalization وTheme والتنقل الأساسي.
- فصل config عن الكود، وإضافة `.env.example` أو الآلية الموجودة دون قيم حساسة.
- إعداد اختبارات أساس الـUI والشبكة والـCI إذا كان ضمن المستودع الحالي.

### خارج النطاق

- منطق الدخول الكامل، شاشات الحجز، Push، الدفع وأي endpoint تجاري.
- إعادة بناء Design System كامل إن كان الموجود مناسبًا.

### معيار القبول

التطبيقان أو البنية المعتمدة يعملان على Android وiOS في بيئة development، مع RTL ومكونات مشتركة وبدون أسرار أو بيانات تجريبية توحي بتكامل حقيقي.

### Prompt المرحلة A1

```text
Execute APPS phase A1 only. Preserve suitable existing Flutter architecture,
state management, navigation, networking, and package choices found in A0.

Implement the shared foundation, environments, RTL/localization, design tokens,
core reusable UI states, and base API/error infrastructure specified in A1.
Do not implement authentication flows, business screens, bookings, payments,
push notifications, or later phases. Do not change backend or database code.

Add and run relevant tests, analyze, and builds supported by the repository.
Update PROJECT_STATUS.md with verified results and stop after A1.
```

## A2 — Authentication والحسابات والاعتماد

### المتطلبات السابقة

- Backend Auth وعقد الجلسة جاهزان.
- طريقة التسجيل والتحقق واستعادة الوصول حُسمت.

### تطبيق العميلة

- الترحيب والدخول وإنشاء الحساب بالطريقة المعتمدة.
- استعادة الجلسة، الملف الشخصي والخروج.

### تطبيق الخبيرة

- الدخول وإنشاء حساب خبيرة.
- استكمال الملف ومستندات الاعتماد.
- عرض حالة `pending/approved/suspended` ومنع الوظائف غير المسموحة.

### مشترك

- Secure Storage وفق عقد الجلسة.
- Refresh منضبط ومنع حلقات `401` ومسح Cache الخاصة بالمستخدم عند الخروج.
- Route Guards كتجربة استخدام فقط، مع الاعتماد على صلاحيات الخادم.

### خارج النطاق

- Social Login أو OTP أو Biometrics إن لم تكن معتمدة.
- شاشة إدارة Admin أو تعديل قاعدة الحسابات.

### معيار القبول

تسجيل ودخول وخروج واستعادة جلسة حقيقية، ورفض الأدوار الخاطئة والحسابات غير المسموح بها، واختبارات انتهاء الجلسة وعدم تسرب بيانات مستخدم سابق.

### Prompt المرحلة A2

```text
Execute APPS phase A2 only using the real documented authentication API.
Implement customer authentication/account screens and expert onboarding,
approval-state gating, secure session restoration, refresh, and logout.

Do not invent OTP, social login, biometrics, admin features, services,
availability, bookings, payments, or later screens. Do not put role or
authorization decisions only in the client.

Cover success, validation, blocked/suspended, expired-session, offline, and
wrong-role cases. Run tests/analyze/build, update PROJECT_STATUS.md, and stop.
```

## A3 — الكتالوج والخبيرات والعناوين

### المتطلبات السابقة

- Backend المدن والخدمات والخبراء والعناوين جاهز.
- الخبيرة يمكن اعتمادها من Dashboard أو Seed موثوق للاختبار.

### تطبيق العميلة

- اختيار المدينة من المدن النشطة.
- الرئيسية والخدمات.
- قائمة الخبيرات والبحث والفلترة والـpagination.
- ملف الخبيرة: النبذة والخدمات والأسعار والمدة والمعرض والتقييمات العامة.
- عناوين العميلة وتحديد الموقع والوصف النصي والعنوان الافتراضي.

### تطبيق الخبيرة

- تعديل الملف المسموح به.
- إدارة الخدمات والأسعار.
- معرض الأعمال.
- تشغيل/إيقاف استقبال الطلبات إذا دعمه API.

### خارج النطاق

- المفضلة، العروض، الكوبونات، Chat والحجز والدفع.
- إظهار مستندات الاعتماد أو روابطها في البيانات العامة.

### معيار القبول

خبيرة معتمدة تظهر للعميلة من API حقيقي بخدماتها وأسعارها، وتدير العميلة عناوينها دون الوصول لعناوين مستخدمة أخرى.

### Prompt المرحلة A3

```text
Execute APPS phase A3 only. Integrate active cities, services, expert discovery,
expert public profiles, customer addresses/location, and expert profile,
services/prices, portfolio, and accepting-status features supported by the API.

Use server-side pagination/filtering and enforce ownership through the API.
Never expose expert identity documents. Do not add favorites, offers, coupons,
chat, availability, booking, payment, or later features.

Test loading/empty/error/forbidden/pagination/form cases with real API contracts.
Run project checks, update PROJECT_STATUS.md, and stop after A3.
```

## A4 — Availability وSlots

### المتطلبات السابقة

- Backend التوفر والاستثناءات وحساب Slots جاهز.
- حُسم ترقيم الأيام والإجازة الكاملة والعمل عبر منتصف الليل ووقت الانتقال إن وجد.

### تطبيق الخبيرة

- إدارة الجدول الأسبوعي وفترات اليوم.
- إدارة الاستثناءات: `available` و`unavailable`.
- تحقق واجهة يمنع القيم الواضحة غير الصحيحة، مع اعتبار Backend الحكم النهائي.

### تطبيق العميلة

- تقويم اختيار الموعد.
- جلب Slots وفق الخبيرة والخدمة والنطاق الزمني.
- عرض المدة والتوقيت المحلي وحالات لا توجد مواعيد.
- تحديث Slots عند العودة أو تغيير الخدمة أو اليوم.

### خارج النطاق

- حساب Slots محليًا، أو حجز الموعد، أو وضع Hold محلي، أو تقويم متقدم غير مطلوب.

### معيار القبول

تغيير جدول الخبيرة أو استثناءاتها ينعكس على Slots العميلة من Backend، مع اختبار الحدود الزمنية وRTL.

### Prompt المرحلة A4

```text
Execute APPS phase A4 only. Implement expert weekly availability and exceptions,
and customer server-provided slot selection for an expert and service.

Do not calculate authoritative slots locally, create bookings, hold times,
implement payments, or change backend/database rules. Handle Cairo timezone,
date boundaries, refresh, empty schedules, conflicts, and validation errors.

Run relevant unit/widget/integration checks, update PROJECT_STATUS.md, and stop.
```

## A5 — إنشاء الحجز وقبول الخبيرة

### المتطلبات السابقة

- Backend Booking State Machine وسجل الحالات وقيد منع التداخل جاهزون.
- حُسم هل `pending` أو `accepted` يشغل الفترة، والمهل وصلاحيات الإلغاء والرفض.

### تطبيق العميلة

- اختيار الخدمة والـSlot والعنوان والملاحظات.
- طلب Preview/Quote من Backend إذا وفره العقد.
- مراجعة بيانات الحجز والمبالغ القادمة من الخادم.
- إرسال الطلب مع منع التكرار وفق العقد.
- نجاح الإرسال، حجوزاتي، تفاصيل الحجز وسجل الحالة والإلغاء المسموح.

### تطبيق الخبيرة

- طلبات `pending` الخاصة بها.
- تفاصيل الطلب، القبول والرفض بالأسباب التي يطلبها API.
- تحديث القوائم والتعامل مع انتهاء أو تغير الحالة.

### خارج النطاق

- الدفع، `on_the_way`, `in_progress`, Chat، والتواصل المباشر غير المعتمد.

### معيار القبول

عميلة ترسل طلبًا، والخبيرة تقبله أو ترفضه، وتظهر الحالة نفسها للطرفين بعد إعادة التحميل. يعالج التطبيق `409` عند فقد الموعد دون إنشاء حجز محلي وهمي.

### Prompt المرحلة A5

```text
Execute APPS phase A5 only against the real booking API and documented state
machine. Implement customer booking review/submission/history/details and
expert pending requests/details/accept/reject, including allowed cancellation.

All amounts, permissions, deadlines, and states must come from the backend.
Handle 409 concurrency conflicts by refreshing availability and current state.
Do not implement payment, confirmed-by-client, on_the_way, in_progress, chat,
review, payouts, or later phases.

Add tests for duplicate taps, stale state, expiry, ownership, and recovery after
app restart. Run checks, update PROJECT_STATUS.md, and stop after A5.
```

## A6 — الدفع وتأكيد الحجز

### المتطلبات السابقة

- بوابة Sandbox وعقد بدء الدفع والتحقق وIdempotency جاهزة.
- سياسة الفشل والإلغاء والاسترجاع والنجاح المتأخر حُسمت.

### تطبيق العميلة

- يظهر الدفع لحجز `accepted` ومملوك لها فقط.
- يعرض السعر والضريبة والإجمالي والعملة كما يعيدها الخادم.
- يبدأ Session الدفع ويستخدم SDK أو redirect المعتمد.
- يعالج success/cancel/failure/unknown كحالة UI، ثم يعيد الاستعلام من Backend.
- يعرض `confirmed` بعد تأكيد الخادم فقط.

### تطبيق الخبيرة

- يتحدث الحجز إلى `confirmed` من API وتصلها النتيجة عبر التحديث أو الإشعار.

### خارج النطاق

- Wallet التطبيق، طرق دفع غير مدعومة، حفظ بيانات بطاقة داخل التطبيق، Refund إداري من تطبيق الخبيرة.

### معيار القبول

دفع Sandbox يؤكد حجزًا مؤهلًا مرة واحدة. إعادة فتح التطبيق أو تكرار callback لا يكرر الخصم أو العملية، ونتيجة غير مؤكدة لا تعرض نجاحًا أو فشلًا زائفًا.

### Prompt المرحلة A6

```text
Execute APPS phase A6 only using the approved sandbox payment integration and
real backend payment endpoints. Show payment only for an eligible accepted
booking owned by the customer. Display server-calculated amounts and currency.

Treat provider return/callback as UI input, not proof of payment. Re-query the
backend and show confirmed only after server verification. Handle unknown,
cancelled, failed, duplicate callback, timeout, and app-restart cases safely.

Do not add an app wallet, unsupported payment methods, card storage, expert
refund controls, completion, reviews, or later phases. Run checks, update
PROJECT_STATUS.md, and stop after A6.
```

## A7 — الإكمال والتقييم

### المتطلبات السابقة

- Backend حسم مَن يكمل الحجز وكيف، وقيود التقييم جاهزة.

### تطبيق العميلة

- متابعة الحجز المؤكد وإجراء الإلغاء إن ظل مسموحًا.
- عرض `completed` من الخادم.
- تقييم الخبيرة: نجوم وتعليق فقط.

### تطبيق الخبيرة

- حجوزات اليوم والقادمة.
- بيانات التنفيذ المسموح بها وفق سياسة كشف العنوان.
- إجراء الإكمال المعتمد.
- تقييم العميلة بعد الإكمال إذا كان التقييم المتبادل مدعومًا.

### خارج النطاق

- `on_the_way`, `in_progress`, live tracking، صور التقييم وChat.

### معيار القبول

لا يظهر أو يقبل التقييم قبل `completed`، ولا يُرسل أكثر من مرة للطرف نفسه، ولا يصل طرف ثالث إلى الحجز أو العنوان.

### Prompt المرحلة A7

```text
Execute APPS phase A7 only. Implement the approved completion action, completed
booking UI, customer-to-expert review, and expert-to-customer review if the API
supports mutual reviews. Reviews are rating plus text only for this MVP.

Respect backend ownership, transition, and address-visibility rules. Do not add
on_the_way, in_progress, live tracking, review images, chat, notifications,
payouts, or later phases.

Test premature/duplicate/third-party reviews, stale state, and completion
authorization. Run checks, update PROJECT_STATUS.md, and stop after A7.
```

## A8 — Push Notifications وDeep Links

### المتطلبات السابقة

- Backend device tokens وإرسال موثوق وpayload contract جاهز.
- مزود Push وAssociated Domains/Links أو البديل المعتمد جاهز.

### نفّذ فقط

- طلب إذن الإشعارات في توقيت مناسب، ودعم الرفض وإعدادات النظام.
- تسجيل وتجديد وحذف Device Token عند الدخول والخروج والتغير.
- التعامل مع foreground/background/terminated.
- Deep Links للأحداث المعتمدة: طلب جديد، قبول/رفض، تأكيد، إلغاء، تذكير، إكمال وتقييم.
- التحقق من الجلسة والدور وملكية المورد ثم جلب حالته الحالية.

### خارج النطاق

- تغيير الحالة اعتمادًا على Payload، حملات تسويقية، إرسال من التطبيق، Chat.

### معيار القبول

الإشعار يفتح الشاشة الصحيحة للمستخدم المصرح له في حالات التطبيق الثلاث، ولا يكشف بيانات مورد غير مملوك، ويستعيد الحالة الحالية من API.

### Prompt المرحلة A8

```text
Execute APPS phase A8 only using the approved push provider and documented
payload/deep-link contract. Implement permission handling, device-token
lifecycle, foreground/background/terminated routing, and secure deep links for
the approved booking events.

Never mutate business state from notification payloads. Re-authenticate when
needed, verify role/ownership through the API, and fetch current resource state.
Do not implement marketing campaigns, client-side sending, chat, payouts, or
later phases.

Test all app states, logout/token replacement, invalid links, wrong role, and
unauthorized resources. Run checks, update PROJECT_STATUS.md, and stop.
```

## A9 — مستحقات الخبيرة والتحويلات

### المتطلبات السابقة

- Backend Payout eligibility والسياسات والـendpoints جاهزة.

### تطبيق الخبيرة

- ملخص المبلغ المؤهل للصرف والمصروف كما يعيدهما الخادم.
- قائمة التحويلات وحالاتها وفتراتها.
- تفاصيل التحويل والحجوزات المرتبطة إذا سمح API.
- توضيح الفرق بين pending وpaid.

### خارج النطاق

- حساب الاستحقاق محليًا، تنفيذ تحويل بنكي من التطبيق، تعديل سجل مالي، Wallet.

### معيار القبول

القيم متطابقة مع API ولا توصف عملية مسجلة كتحويل مصرفي منفذ إلا إذا أكد الخادم ذلك.

### Prompt المرحلة A9

```text
Execute APPS phase A9 only. Implement expert earnings and payout read-only UI
using the real backend as the sole source of eligibility, totals, status,
periods, and linked bookings.

Do not calculate authoritative earnings locally, initiate bank transfers,
edit financial history, add a wallet, or modify backend/database rules.
Cover empty/error/pagination/privacy cases, run checks, update
PROJECT_STATUS.md, and stop after A9.
```

## A10 — Hardening وRelease Readiness

### المتطلبات السابقة

- الرحلة الأساسية المتكاملة مكتملة على بيئة staging.
- حسابات ومفاتيح وتوقيع المتاجر غير مطلوبة إلا إذا شمل التكليف إعداد النشر.

### نفّذ فقط

- E2E للرحلة الأساسية والفروع الحرجة على staging.
- مراجعة RTL وaccessibility والمقاسات وDynamic Type والتوقيت والعملة.
- اختبار الشبكة الضعيفة وtimeouts واستئناف التطبيق والجلسة وDeep Links.
- إزالة debug logs والبيانات الوهمية من release builds.
- مراجعة crash reporting وanalytics المتفق عليها والخصوصية.
- إعداد build flavors وsigning/documentation حسب النطاق المصرح.
- توثيق التشغيل والاختبار وإجراءات الإصدار والقيود المتبقية.

### خارج النطاق

- رفع المتاجر أو production deploy أو تغيير حسابات ومفاتيح حقيقية دون طلب صريح.
- ادعاء production-ready بسبب نجاح build فقط.

### معيار القبول

تعمل الرحلة الكاملة على staging للطرفين، والفحوص موثقة، ولا توجد أسرار أو Mocks في release، مع قائمة واضحة بأي مخاطر أو قرارات تمنع الإصدار.

### Prompt المرحلة A10

```text
Execute APPS phase A10 only. Harden and verify the already implemented customer
and expert journeys on staging. Complete relevant E2E, accessibility, RTL,
responsive, lifecycle, network, session, deep-link, privacy, and release-build
checks. Remove release mocks/debug leakage and document reproducible results.

Do not add new product features, publish to stores, deploy production, rotate
credentials, or claim production readiness without evidence. Update
PROJECT_STATUS.md with passes, failures, blockers, and remaining release risks,
then stop.
```

## 10. ترتيب الإنجازات المتكاملة

| الإنجاز | المراحل | دليل النجاح |
| --- | --- | --- |
| أساس التطبيقين | A0–A2 | الجلسة والأدوار تعملان دون تسرب بين المستخدمين |
| اكتشاف خبيرة | A3 | خبيرة معتمدة وخدماتها تظهران من API حقيقي |
| اختيار موعد | A4 | Slots تعكس توفر الخبيرة واستثناءاتها |
| الحجز والقبول | A5 | طلب وقبول/رفض وحالة متسقة للطرفين |
| الدفع والتأكيد | A6 | Sandbox موثوق يحول الحجز إلى `confirmed` مرة واحدة |
| الإكمال والتقييم | A7 | إكمال صحيح وتقييم واحد لكل طرف |
| الإشعارات | A8 | Deep Links آمنة في حالات التطبيق الثلاث |
| المستحقات | A9 | عرض مالي مطابق للخادم دون حساب محلي |
| الاستعداد للإصدار | A10 | رحلة staging كاملة وفحوص موثقة |

أول Milestone للعرض والـPortfolio هو A5: خبيرة معتمدة تضيف خدمة وسعرًا وتوفرًا، ثم تراها العميلة وتختار موعدًا وترسل طلبًا، وتقبله الخبيرة، مع اختبار منع التداخل في Backend.

## 11. قرارات يجب ألا يخترعها Agent

| القرار | المرحلة التي يجب حسمه قبلها |
| --- | --- |
| تطبيقان منفصلان أو تطبيق واحد متعدد الأدوار | A1 |
| مكتبة إدارة الحالة في مشروع جديد | A1 |
| طريقة التسجيل والتحقق والاستعادة | A2 |
| مدينة الإطلاق وحدود العناوين | A3 |
| ترقيم الأيام والعمل عبر منتصف الليل ووقت الانتقال | A4 |
| الحالة التي تشغل الموعد والمهل والإلغاء والرفض | A5 |
| اختلاف السعر قبل الإرسال ووقت تثبيت لقطة السعر | A5 |
| بوابة الدفع والضريبة والاسترجاع والنجاح المتأخر | A6 |
| مَن يكمل الحجز ومتى يُكشف العنوان للخبيرة | A7 |
| مزود Push وPayload وDeep Link domains | A8 |
| أهلية الصرف وأثر الاسترجاع بعد التحويل | A9 |

إذا لم يكن القرار مؤثرًا على المرحلة الحالية، لا توقف العمل بسببه. إذا كان مؤثرًا ولم يوجد في الكود أو الوثائق، وثّق الخيارات واطلب قرارًا واحدًا محددًا دون تنفيذ افتراض خفي.

## 12. الاختبارات المطلوبة

### Unit tests

- Error mapping، تنسيق الوقت والعملة، تحويل DTOs، session coordination وحالات state الحساسة.
- لا تعيد اختبار Flutter أو مكتبات الطرف الثالث.

### Widget tests

- Loading/empty/error/success، validation، تعطيل الإرسال المتكرر، RTL وaccessibility للعناصر المهمة.

### Integration/E2E

- تسجيل الدخول واستعادة الجلسة والخروج.
- اعتماد خبيرة ثم ظهورها للعميلة عند توفر بيئة مشتركة.
- التوفر والـSlots.
- إنشاء الحجز وقبوله وتعارض `409`.
- الدفع Sandbox والعودة/إعادة التشغيل وعدم تكرار الأثر.
- الإكمال والتقييم.
- Push وDeep Links في الحالات الثلاث.

لا تستخدم بيانات حقيقية أو production endpoints. لا تعتبر Mock test إثباتًا لتكامل API أو بوابة دفع.

## 13. قالب تقرير نهاية كل مرحلة

استخدم القالب التالي دون تحويله إلى كلام إنشائي:

```text
Phase: A# — <name>
Status: completed | partial | blocked

Implemented:
- <verified behavior>

Key files:
- <path>: <purpose>

API integration:
- Real endpoints used: <list>
- Mock/fixture usage: <none or exact scope>
- Missing/changed contracts: <list>

Verification:
- <command>: PASS | FAIL | NOT RUN — <reason>

Database/backend changes:
- None (expected for mobile phases), or document an explicitly authorized change.

Open blockers/decisions:
- <only items that block next requested work>

PROJECT_STATUS.md:
- Updated with the evidence above.

Next phase:
- A# is recommended but was not started.
```

## 14. Prompt عام لتشغيل أي مرحلة

استبدل `<PHASE>` برقم المرحلة فقط:

```text
Read AGENTS.md, ROADMAP_README.md, APPS_README.md, PROJECT_STATUS.md if present,
and the relevant backend/API documentation. Inspect the repository and Git
state before changing anything.

Execute APPS phase <PHASE> only, exactly as defined in APPS_README.md.
Implement its required scope and acceptance criteria, including relevant tests
and error/empty/loading/permission states. Preserve suitable existing choices.

Do not implement later phases, speculative features, or undocumented business
rules. Do not modify backend or database code unless this prompt explicitly
authorizes a named change. Do not commit, push, deploy, or publish unless
explicitly requested.

Run the repository's relevant analyze/test/build commands. Update
PROJECT_STATUS.md with verified evidence, then return the phase completion
report using the template in APPS_README.md and stop.
```
