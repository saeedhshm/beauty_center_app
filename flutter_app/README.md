# تطبيقات لمسة

يحتوي هذا المجلد على تطبيقين Flutter مستقلين وحزم الأساس المشتركة المنفذة في المرحلة `A1`:

- `apps/customer_app`: تطبيق العميلة.
- `apps/expert_app`: تطبيق الخبيرة.
- `packages/design_system`: الهوية البصرية والمكونات والحالات العامة.
- `packages/localization`: النصوص المركزية ودعم العربية والإنجليزية.
- `packages/networking`: إعداد البيئة وعميل API وتصنيف الأخطاء ومراقبة الشبكة.

لا تتضمن هذه المرحلة تسجيل الدخول أو الشاشات التجارية أو بيانات تجريبية توحي بتكامل API.

## المتطلبات

- Flutter `3.41.1` أو إصدار متوافق مع Dart `3.11`.
- Backend محلي عند بدء ربط endpoints في المراحل التالية.

## التشغيل

تُمرر البيئة وعنوان API عبر `dart-define`، ولا تحفظ أسرار في التطبيق:

```sh
cd apps/customer_app
flutter run \
  --dart-define=APP_ENV=development \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

استخدم `apps/expert_app` لتشغيل تطبيق الخبيرة. عنوان `10.0.2.2` يصل إلى الجهاز المضيف من Android Emulator؛ استخدم `http://127.0.0.1:3000` على iOS Simulator. يقبل `APP_ENV` القيم `development` و`staging` و`production`، ويتطلب `API_BASE_URL` عنوان HTTPS في staging وproduction.

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
