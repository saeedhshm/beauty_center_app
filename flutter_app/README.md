# تطبيقات لمسة

يحتوي هذا المجلد على تطبيقين Flutter مستقلين وحزم مشتركة منفذة حتى المرحلة `A10`:

- `apps/customer_app`: تطبيق العميلة (كتالوج، مواعيد، حجوزات، دفع Demo، إكمال، تقييم، تنبيهات).
- `apps/expert_app`: تطبيق الخبيرة (ملف، خدمات، معرض، توفر، طلبات، إكمال، تقييم، تنبيهات، مستحقات).
- `packages/design_system`: الهوية البصرية والمكونات والحالات العامة.
- `packages/localization`: النصوص المركزية ودعم العربية والإنجليزية.
- `packages/networking`: إعداد البيئة وعميل API وتصنيف الأخطاء ومراقبة الشبكة.
- `packages/authentication`: عقد المصادقة والجلسة والتخزين الآمن وواجهات الحساب المشتركة.
- `packages/catalog`: عقود الكتالوج والحجوزات والدفع والتقييم والمستحقات والتنبيهات والروابط.
- `packages/notifications`: تسجيل Device Token عبر Firebase (يتدهور بصمت بلا إعداد) مع
  **إعادة محاولة محدودة عند فشل مؤقت**، وحالة شاشة التنبيهات المشتركة بين التطبيقين
  (`NotificationFeedController`) مع pagination وسباقات الطلبات.

الرحلة الأساسية مكتملة للطرفين: تسجيل → اعتماد → توفر → موعد → حجز → قبول → دفع Demo → تأكيد → إكمال → تقييم متبادل → مستحقات (للخبيرة) وتنبيهات. الدفع Demo موسوم بلا أموال حقيقية، واستلام Push الفوري محجوب حتى ملفات إعداد Firebase.

### A8 — تدقيق Push: ما هو منفَّذ وما هو خارج المتناول

**منفَّذ في هذا المستودع (بلا أي سر):**
- استقبال الرسائل في الحالات الثلاث عبر Firebase Messaging: `onMessage` للواجهة الأمامية، و`onMessageOpenedApp` للفتح من الخلفية، و`getInitialMessage()` للإقلاع من حالة إنهاء التطبيق، مع معالج خلفية معزول (`registerPushBackgroundHandler`) لا يفتح شيئًا ولا يغيّر حالة.
- توجيه صارم: `lamsa://booking/<uuid>` و`data.bookingId` يتقاسمان **نفس قاعدة المعرّف** (`isValidBookingId`)، ونوع الحدث يجب أن يكون ضمن `approvedPushEvents` وإلا يُتجاهل. لا تُستخرج حالة عمل من الـpayload إطلاقًا.
- `PushCoordinator`: يؤجّل الوجهة أثناء `restoring`، ولا يفتح شيئًا بلا جلسة مُصادَقة بالدور الصحيح، ثم يفتح عبر شاشة التفاصيل التي **تجلب الحجز من الـAPI** — فحجز غير مملوك يبقى 404 من الخادم ولا تُعرض بياناته.
- التنقل في التطبيقين: `onBookingOpenerReady` من الـshell إلى `PushCoordinator`، مع cold start مؤجَّل حتى استعادة الجلسة.
- `AndroidManifest` (intent filter لـ`lamsa`/`booking`) و`Info.plist` (`CFBundleURLTypes`) للتطبيقين —بدون ترويسة فقط، بلا universal link.

**لا يمكن تنفيذه هنا ويحتاج قرارًا وتجهيزًا خارجيين:**
- **الخادم لا يرسل شيئًا**: `PUSH_MODE=demo` يختار `DemoPushSender` الذي يسجّل ولا يرسل. هذا **أكبر عائق** ولا علاقة له بملفات Firebase. يلزم مزود إرسال حقيقي (FCM HTTP v1/Admin SDK) واعتماده.
- ملفات المنصة: `google-services.json` و`GoogleService-Info.plist` غير موجودة ولا تُخترع هنا.
- إضافة `com.google.gms.google-services` إلى Gradle، ومفتاح `aps-environment` في entitlements، وقدرة Push Notifications في حساب Apple، ومفتاح/خدمة FCM في Backend.
- Associated domains / Universal Links: **غير مُهيَّأة ولا مُعتمدة**، لذلك لم تُضف. `lamsa://` رابط داخلي فقط ولا يُعدّ universal link.
- إشعار محلي في الواجهة الأمامية غير منفَّذ: لا حزمة `flutter_local_notifications`، وهذه خطوة لاحقة تحتاج قرارًا مستقلًا عن تجربة العرض.

**القيم الخارجية المطلوبة قبل ادعاء اكتمال Push:** مزوّد إرسال حقيقي بدل `DemoPushSender` واعتماد حساب الخدمة في الخادم، وملفا `google-services.json` و`GoogleService-Info.plist`، وإضافة Gradle plugin، وقدرة APNs مع `aps-environment`.

### إعادة محاولة تسجيل الجهاز (محدودة)

- فشل `Firebase.initializeApp` المؤقت أو فشل `POST /devices` **لا يُترك بلا أثر طوال الجلسة**:
  تُسلَّح محاولة محدودة (3 محاولات لكل رمز) وتُعاد على أحداث موجودة أصلًا — **عودة الشبكة**
  (`NetworkMonitor.changes`) و**استئناف التطبيق** — بلا حلقة دورية ولا مؤقت ولا اعتمادية جديدة.
- الإذن لا يُطلب مرتين: نتيجة الطلب محفوظة للجلسة، و**الرفض يوقف المحاولة نهائيًا** فلا يُزعج المستخدم.
- لا يُسجَّل أي token ولا سر، ولا شيء يُطبع.
- بعد نجاح التسجيل تصبح المحاولات التالية **لا أثر لها**، فلا يتكرر تسجيل الجهاز.
- إعادة المحاولة لا تعمل إلا والجلسة `authenticated` وتُسلسل مع rotation وlogout، فلا يُسجَّل جهاز بعد خروج المستخدم؛ وفشل Push لا يمنع استخدام التطبيق إطلاقًا.

### دورة حياة رمز الجهاز (best-effort)

- `POST /devices` يعيد صف الجهاز نفسه عند إعادة التسجيل بنفس الرمز (upsert على `token`)، فالتسجيل التالي على الجهاز نفسه يعيد نفس المعرّف.
- الحذف `DELETE /devices/:id` يبقى في الذاكرة حتى يؤكده الخادم: فشل الحذف **لا يمسح** المعرّف، ومحاولة تالية آمنة تعطي النتيجة المطلوبة (و`404` يعني أن الصف اختفى فعلًا فيُعامل كنجاح).
- عند logout يفشل الحذف، **لا يُمنع الخروج**: تُمسح النسخة المحلية ويُبلَّغ الفشل. المخاطرة المتبقية: `device_tokens` بلا عمود انتهاء ولا مهمة تنظيف، فصف يتعذّر حذفه ولا تُسجَّل له زيارات بعده يبقى على الخادم؛ تعافيه الوحيد هو الدخول التالي على الجهاز نفسه فيعيد `POST /devices` المعرّف نفسه. لا يوجد تخزين دائم للمعرّف في التطبيق لأن التعافي القائم يكفي ولا حاجة مثبتة لتخزينه.

## المتطلبات

- Flutter `3.41.1` أو إصدار متوافق مع Dart `3.11`.
- Backend محلي لتجربة المصادقة الحقيقية. وضع العرض الحالي يعيد `deliveryMode: demo` ويستخدم OTP المعلن `123456` دون SMS.

## التشغيل

تُمرر البيئة وعنوان API عبر `dart-define`، ولا تحفظ أسرار في التطبيق:

```sh
cd apps/customer_app
flutter run \
  --dart-define=APP_ENV=development \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

استخدم `apps/expert_app` لتشغيل تطبيق الخبيرة. عنوان `10.0.2.2` يصل إلى الجهاز المضيف من Android Emulator؛ استخدم `http://127.0.0.1:3000` على iOS Simulator. يقبل `APP_ENV` القيم `development` و`staging` و`production`، ويتطلب `API_BASE_URL` عنوان HTTPS في staging وproduction.

يُحفظ refresh token فقط في التخزين الآمن باسم منفصل لكل تطبيق، بينما يبقى access token في الذاكرة. على iOS تستخدم التطبيقات Keychain entitlements مستقلة، وعلى Android عُطل النسخ الاحتياطي لتجنب استعادة مادة تشفير غير صالحة. لا تشترك جلسات العميلة والخبيرة، ويُرفض الدور الخطأ بعد كل دخول أو تجديد.

حالة وثيقة الخبيرة لا يعيدها `GET /experts/me` حاليًا؛ لذلك تؤكد الواجهة نجاح الرفع في الجلسة الحالية فقط وتعرض إمكانية الرفع أو الاستبدال بعد إعادة التشغيل، دون ادعاء أن قائمة الاعتماد مكتملة. لا يوجد endpoint لإرسال الملف للمراجعة؛ حالة `pending/approved/suspended` من الخادم هي المرجع.

## الفحوص

نفذ داخل كل تطبيق أو حزمة متأثرة:

```sh
flutter pub get
flutter analyze
flutter test
```

لبناء نسخ التطوير:

```sh
flutter build apk --debug --dart-define=APP_ENV=development
flutter build ios --simulator --debug --dart-define=APP_ENV=development
```

## مستويات الاختبار (مصطلحات دقيقة)

- **unit/widget**: منطق وواجهات ببوابات وهمية (mocks) — لا تثبت أي تكامل حقيقي.
- **رحلة تكامل API محلية** (`test/api_integration_journey_test.dart`): فئات البوابات
  الحقيقية تُستدعى مباشرة ضد Backend حقيقي وقاعدة معزولة — **بدون واجهات
  Flutter**، وليست E2E.
- **تكامل واجهة Flutter** (`integration_test/app_journey_test.dart`): التطبيق
  والشاشات الحقيقية تُقاد بالنقر ضد Backend حقيقي وقاعدة معزولة — تُشغل على
  جهاز/محاكي (`flutter test -d <id> integration_test`)، لا تغطي استلام Push
  الفوري أو روابط المنصة العميقة.
- **رحلة staging E2E**: **غير موجودة** — لا توجد بيئة staging، وA8 ما زالت
  جزئية (بلا Push فوري). أي ادعاء E2E كامل مرفوض حتى تحسم.

## رحلة التكامل المحلية (ليست staging ولا E2E كاملًا)

لا توجد بيئة staging. تُشغل الرحلتان ضد Backend محلي وقاعدة معزولة:

```sh
# 1. قاعدة معزولة + migrations (على خادم اختبار Postgres المحلي)
psql -h 127.0.0.1 -p 55433 -U lamsa_test -d lamsa_test \
  -c "DROP DATABASE IF EXISTS lamsa_e2e;" -c "CREATE DATABASE lamsa_e2e;"
cd ../../web_app/backend
DATABASE_URL=postgresql://lamsa_test:lamsa_test@127.0.0.1:55433/lamsa_e2e npm run db:migrate
# 2. تهيئة مدير وخدمة (بيانات اصطناعية فقط)، ثم تشغيل API على 3100
# 3. من apps/customer_app — رحلة تكامل API (بدون واجهات):
LAMSA_E2E_BASE_URL=http://127.0.0.1:3100 flutter test test/api_integration_journey_test.dart
# 4. من apps/customer_app — تكامل الواجهة على محاكي/جهاز حقيقي:
LAMSA_E2E_BASE_URL=http://127.0.0.1:3100 flutter test -d <device-id> --dart-define=LAMSA_E2E_BASE_URL=http://127.0.0.1:3100 integration_test
# 5. إيقاف الخادم وحذف lamsa_e2e بعد الانتهاء
```

تغطي رحلة API: تسجيل الطرفين، اعتماد الخبيرة، التوفر، المواعيد، العنوان،
إنشاء الحجز، القبول، الدفع والتأكيد، الإكمال، التقييم المتبادل، أهلية
المستحقات، التنبيهات، وحل رابط عميق — ببيانات اصطناعية فقط. ويغطي تكامل
الواجهة: تسجيل عميلة حقيقية، وظهور الخدمة المهيأة والخبيرة المعتمدة ومواعيدها
الحقيقية داخل الشاشات الحقيقية.

## ملاحظات الإصدار

- لا أسرار في المستودع: لا `google-services.json` ولا `GoogleService-Info.plist`
  ولا مفاتيح APNs ولا بيانات بطاقات؛ التوكنات في الذاكرة والتخزين الآمن فقط.
- لا رفع للمتاجر ولا production deploy ولا توقيع release دون تفويض صريح.
- `APP_ENV=production` يتطلب `API_BASE_URL` بـHTTPS (مفروض في `AppConfig`).
- استلام Push الفوري محجوب حتى توفير ملفات إعداد Firebase ومفتاح APNs.
- ليست `production-ready`: بلا staging ولا نسخ احتياطي مجدول ولا مزودي دفع/إشعارات حقيقيين.
