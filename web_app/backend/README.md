# لمسة — Backend

أساس API باستخدام Node.js وTypeScript وExpress 5 وPostgreSQL وDrizzle. مدير الحزم هو npm و`package-lock.json` هو ملف القفل المعتمد.

## الحالة الحالية

- منفذ: التحقق من البيئة، HTTP server، logging منظم، Request IDs، أخطاء JSON، حد حجم الطلب، security headers، اتصال PostgreSQL وDrizzle، liveness/readiness، وإغلاق الخادم والاتصالات عند SIGINT/SIGTERM.
- `GET /health/live`: يعيد 200 ما دام خادم HTTP يعمل، دون طلب قاعدة البيانات.
- `GET /health/ready`: ينفذ `SELECT 1` ويعيد 200 أو 503. نجاحه يثبت الاتصال فقط، ولا يثبت وجود جداول الأعمال.
- نُفذت 17 جدول أعمال و8 جداول تقنية، و11 migration؛ توجد قاعدة تطوير محلية دائمة وبيانات عرض، واختبارات PostgreSQL معزولة.
- توجد مسارات تسجيل العميلة والخبيرة والتحقق من OTP والدخول بكلمة مرور وتجديد الجلسة والخروج والملف الحالي، مع استعادة/تغيير كلمة المرور وتغيير الهاتف وتعديل الملف والتعطيل الذاتي والإداري وقراءة سجل التدقيق.
- **وضع عرض MVP:** الإعداد المحلي `AUTH_OTP_MODE=demo` يستخدم رمز **`123456`** وسر Auth تجريبيًا افتراضيًا. التسجيل يعمل دون SMS؛ هذه محاكاة وليست إثبات ملكية الهاتف. ربط المزود الحقيقي متبقٍ.
- نُفذت APIs دخول المدير والإعدادات والخدمات والخبيرات والاعتماد والعناوين. السوق القاهرة بعملة EGP وتوقيت Africa/Cairo، والهواتف الجديدة مصرية. التفاصيل وحسابات العرض في `docs/catalog.md`.
- الحجز والدفع والـWorker ورفع الملفات منفذة عبر API؛ قابلية تعديل الإعدادات الحالية عبر API ولا توجد لوحة مرئية بعد. الواجهات (هاتف ولوحة) مراحل لاحقة.

## التشغيل المحلي

المتطلبات: Node.js 22.13+ ضمن سلسلة 22، أو 24، أو 26+، وnpm وDocker مع تشغيل الـdaemon.
نفّذ الأوامر التالية داخل `web_app/backend`:

```sh
npm ci
cp .env.example .env
```

ملف `.env` المحلي جاهز، كما يحتوي `.env.example` على إعداد العرض نفسه؛ لا حاجة لتوليد سر خاص لتجربة الـMVP. بعد تجهيز القاعدة:

```sh
docker compose up -d --wait db
npm run db:migrate
npm run db:seed:demo
npm run dev
```

قاعدة Compose محلية جديدة ومستقلة، على `127.0.0.1:55432` باسم `lamsa_dev`. بيانات الدخول التجريبية موجودة صراحة في Compose و`.env.example`؛ لا تستخدمها لبيئة منشورة. الخدمة `db` تحفظ بياناتها في volume. عند توفر قاعدة تطوير قائمة، اضبط `DATABASE_URL` لها بدل تشغيل قاعدة أخرى؛ لا تُشغَّل migrations تلقائيًا عند الإقلاع.

```sh
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/health/ready
```

لبناء وتشغيل JavaScript:

```sh
npm run build
npm start
```

`dev` و`start` يقرآن `.env`. في بيئة توفر المتغيرات خارجيًا يمكن استخدام `npm run start:production` بعد البناء. لا يوجد إعداد نشر فعلي حاليًا. القيمة الافتراضية لـ`HOST` هي `127.0.0.1`؛ عند تشغيل الخادم داخل container يلزم اختيار عنوان الربط المناسب.

إيقاف PostgreSQL المحلي دون إزالة volume:

```sh
docker compose stop db
```

## البيئة

| المتغير | السلوك |
| --- | --- |
| `DATABASE_URL` | مطلوب، رابط PostgreSQL، ولا يطبع في السجل |
| `NODE_ENV` | development أو test أو production |
| `HOST` / `PORT` | افتراضيًا 127.0.0.1 و3000 |
| `LOG_LEVEL` | افتراضيًا info |
| `DB_POOL_MAX` | من 1 إلى 50، افتراضيًا 10 |
| `DB_TIMEOUT_MS` | مهلة اتصال/استعلام من 100 إلى 30000ms، افتراضيًا 3000 |
| `AUTH_OTP_MODE` | `demo` للعرض برمز 123456، أو `disabled` لتعطيل الإرسال إلى حين ربط مزود |
| `AUTH_SECRET` | افتراضي تجريبي معلن في وضع demo؛ قيمة خاصة بطول 32 حرفًا على الأقل خارج العرض؛ لا يحتاجه CLI migrations |
| `AUTH_ACCESS_TTL_SECONDS` | عمر access token؛ افتراضيًا 900 ثانية |
| `AUTH_SESSION_TTL_SECONDS` | عمر الجلسة المطلق؛ افتراضيًا 2592000 ثانية |
| `AUTH_OTP_TTL_SECONDS` | صلاحية رمز التسجيل؛ افتراضيًا 300 ثانية |
| `PUSH_MODE` | `demo` لتسجيل الإشعارات وتسليمها محاكاةً بلا إرسال، أو `disabled` لإرجاع `PUSH_DELIVERY_UNAVAILABLE`؛ الافتراضي في الإنتاج `disabled` |

إعداد غير صحيح يمنع الإقلاع ويذكر أسماء الحقول فقط. تعطل PostgreSQL لا يمنع liveness، لكنه يجعل readiness تُرجع 503. يحتاج الاتصال بخادم بعيد إلى إعداد TLS وفق مزوده؛ لا تُعطل التحقق من الشهادة.

## الفحوص

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

اختبارات `npm test` تستخدم اتصال قاعدة محاكى لاختبار عقد HTTP وسلوك الفشل، ولا تثبت تكامل PostgreSQL.

اختبار الاتصال الحقيقي يستخدم قاعدة منفصلة ثابتة محليًا، ولا يرث `DATABASE_URL`:

```sh
docker compose --profile test up -d --wait db-test
npm run test:integration
docker compose --profile test stop db-test
```

خادم الاختبار على المنفذ `55433` ببيانات دخول محلية `lamsa_test`. يبدأ setup من قاعدة `lamsa_test` وينشئ لكل تشغيل قاعدة فريدة `lamsa_it_<uuid>`، يطبق عليها migrations ويكتب بيانات تجريبية، ثم يحذف هذه القاعدة وحدها عند الانتهاء. لا يرث `DATABASE_URL` ولا يعيد ضبط قاعدة مستخدم. الاختبارات تشمل قيود الحجز والتزامن على مستوى البيانات، ورحلة التسجيل والدخول والجلسات عبر HTTP وقاعدة حقيقية مع SMS وهمي؛ لا تثبت تكامل SMS حقيقي أو رحلة حجز عبر API.

## عقد HTTP والأخطاء

العقد المتاح في `docs/openapi.yaml` مع مراجع إلى `docs/catalog.openapi.yaml` و`docs/payments.openapi.yaml` و`docs/payouts.openapi.yaml` و`docs/engagement.openapi.yaml`. كل مسارات الحسابات والكتالوج والإدارة والتقييمات والإشعارات تحت `/api/v1`. الشرح في `docs/auth.md` و`docs/catalog.md` و`docs/bookings.md` و`docs/payments.md` و`docs/payouts.md` و`docs/engagement.md`.

```json
{
  "error": { "code": "NOT_FOUND", "message": "المسار غير موجود" },
  "requestId": "75727951-3f28-4a21-ad39-56c17f72d603"
}
```

يرد Request ID نفسه في `X-Request-ID`. الأكواد العامة: `NOT_FOUND` (404)، `INVALID_JSON` (400)، `PAYLOAD_TOO_LARGE` (413)، `UNSUPPORTED_ENCODING` (415)، `SERVICE_UNAVAILABLE` (503)، و`INTERNAL_ERROR` (500). حد JSON هو 32kb. السجل لا يحتوي headers أو bodies أو عناوين URLs أو أخطاء الاتصال الخام، ويسجل معرف الطلب والحالة والمدة.

## قاعدة البيانات وmigrations

`src/db/client.ts` يهيئ الاتصال وDrizzle. `src/db/schema/` يحتوي الجداول، و`drizzle.config.ts` يحدد مكانها ومكان migrations. لا يعني وجود الجداول تنفيذ قواعد العمل أو API.

طريقة تطوير المخطط:

1. تعديل تعريفات Drizzle ثم `npm run db:generate -- --name=descriptive_name` مع إعداد البيئة المحلية.
2. مراجعة SQL وتطبيق سلسلة migrations كاملة عبر `npm run db:migrate` على البيئة المحلية المحددة. امتداد `btree_gist` مطلوب لقيد الاستبعاد.
3. استخدام migration مخصصة عند تعديل قيد EXCLUDE غير الممثل في Drizzle، وعدم استخدام `drizzle-kit push` كبديل لسلسلة migrations.
4. تشغيل `npm run test:integration` للتحقق من بناء قاعدة فارغة والقيود والتزامن قبل تطبيق تغييرات على قاعدة تطوير قائمة.

إعداد CLI الحالي محلي ويمنع `NODE_ENV=production`؛ هذا ليس بديلًا عن فحص عنوان القاعدة المستهدفة. طُبقت migrations على قواعد الاختبار وعلى قاعدة التطوير المحلية الجديدة، دون إنتاج. تمثل النسب بقيم مئوية (20 تعني 20%)؛ العمولة الافتراضية المعتمدة 20% قابلة للتعديل، والضريبة لم تُحسم. seed العرض قابل للتكرار ولا يغير حسابات أو إعدادات موجودة.

## المهام الخلفية

عملية Worker مستقلة في `src/worker.ts` تشغّل كل دورة (افتراضيًا كل 30 ثانية):

1. `expireDueBookings(db, now)` لانتهاء الحجوزات المستحقة.
2. `deliverPendingNotifications(db, { mode, batchSize })` لتسليم إشعارات محفوظة في معاملة تمّت.
3. `cleanupExpiredRecords(db, now)` لحذف الصفوف التقنية المنتهية فقط (تحديات OTP، الجلسات وrefresh بعد 7 أيام، العدادات، مفاتيح عدم التكرار، صفوف outbox المنتهية) دون مساس بالتاريخ المالي أو الحسابي.

آمنتان تحت تشغيل أكثر من عامل: الانتهاء مشروط في `UPDATE` نفسه، والصفوف تُحجز
بـ`FOR UPDATE SKIP LOCKED` مع lease في `next_attempt_at`، والإرسال خارج أي معاملة،
والتسليم at-least-once. الدورة لا تتداخل مع نفسها، والإيقاف بـSIGTERM/SIGINT ينتظر
الدورة الجارية ثم يغلق الاتصالات. السجلات أعداد فقط بلا بيانات حساسة.

```sh
npm run worker            # تطوير مع إعادة التحميل
npm run build && npm run worker:start
```

الإعداد في `.env` (بلا أسرار): `WORKER_INTERVAL_MS` (1000–3600000) و`WORKER_BATCH_SIZE`
(1–500) و`PUSH_MODE` (`demo` يحاكي التسليم دون إرسال، و`disabled` يوقف التسليم
برمز 503). يمكن تشغيل عدة نسخ من العملية نفسها أمام القاعدة نفسها.

## الخطوة التالية

الرحلات المتاحة عبر API: التسجيل والدخول (مع استعادة/تغيير كلمة المرور وتغيير الهاتف وتعديل الملف والتعطيل) واعتماد خبيرة واكتشاف خدماتها وعنوان العميلة والتوفر والحجز (مع `Idempotency-Key` الاختياري) والقبول والدفع التجريبي والمستحقات والتقييمات والإشعارات والمعرض والوثائق الخاصة. المتبقي: مزود دفع ودفع Push حقيقيان، واجهات الهاتف ولوحة الإدارة، CI والتشغيل المنشور. التفاصيل في `docs/engagement.md` و`../../PROJECT_STATUS.md`.
