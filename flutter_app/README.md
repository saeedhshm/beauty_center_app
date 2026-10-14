# تطبيقات لمسة

يحتوي هذا المجلد على تطبيقين Flutter مستقلين وحزم مشتركة منفذة حتى المرحلة `A10`:

- `apps/customer_app`: تطبيق العميلة (كتالوج، مواعيد، حجوزات، دفع Demo، إكمال، تقييم، تنبيهات).
- `apps/expert_app`: تطبيق الخبيرة (ملف، خدمات، معرض، توفر، طلبات، إكمال، تقييم، تنبيهات، مستحقات).
- `packages/design_system`: الهوية البصرية والمكونات والحالات العامة.
- `packages/localization`: النصوص المركزية ودعم العربية والإنجليزية.
- `packages/networking`: إعداد البيئة وعميل API وتصنيف الأخطاء ومراقبة الشبكة.
- `packages/authentication`: عقد المصادقة والجلسة والتخزين الآمن وواجهات الحساب المشتركة.
- `packages/catalog`: عقود الكتالوج والحجوزات والدفع والتقييم والمستحقات والتنبيهات والروابط.
- `packages/notifications`: تسجيل Device Token عبر Firebase (يتدهور بصمت بلا إعداد).

الرحلة الأساسية مكتملة للطرفين: تسجيل → اعتماد → توفر → موعد → حجز → قبول → دفع Demo → تأكيد → إكمال → تقييم متبادل → مستحقات (للخبيرة) وتنبيهات. الدفع Demo موسوم بلا أموال حقيقية، واستلام Push الفوري محجوب حتى ملفات إعداد Firebase.

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
