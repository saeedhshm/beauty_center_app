# تطبيقات لمسة

يحتوي هذا المجلد على تطبيقين Flutter مستقلين وحزم مشتركة منفذة حتى المرحلة `A2`:

- `apps/customer_app`: تطبيق العميلة.
- `apps/expert_app`: تطبيق الخبيرة.
- `packages/design_system`: الهوية البصرية والمكونات والحالات العامة.
- `packages/localization`: النصوص المركزية ودعم العربية والإنجليزية.
- `packages/networking`: إعداد البيئة وعميل API وتصنيف الأخطاء ومراقبة الشبكة.
- `packages/authentication`: عقد المصادقة والجلسة والتخزين الآمن وواجهات الحساب المشتركة.

تتضمن `A2` التسجيل عبر OTP والدخول والاستعادة والملف والخروج، واستكمال ملف الخبيرة ووثيقتها وعرض حالة الاعتماد. لا تتضمن خدمات أو توفرًا أو حجوزات أو دفعًا أو Push.

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
