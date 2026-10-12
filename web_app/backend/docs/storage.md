# الوسائط — المعرض ووثائق الهوية

## القرار والنطاق

الصور والوثائق تُحفظ خارج PostgreSQL عبر `StorageProvider` في `src/integrations/storage/`،
والقاعدة تحمل المراجع فقط (`portfolio_images.storage_key` و`expert_profiles.identity_document_key`).
التنفيذ الحالي `LocalStorageProvider` على قرص محلي للعرض والتطوير؛ مزود الإنتاج
(S3-compatible أو ما يعادله) يُستبدل خلف الواجهة نفسها دون تغيير المسارات.
مجلد التخزين ليس جذر ويب عامًا: البايتات تُسلَّم فقط عبر مسارات API موثقة أدناه،
والمفاتيح مسارات معتمة بأسماء مولدة (`portfolio/{expertId}/{uuid}.{ext}` و
`identity/{userId}/{uuid}.{ext}`) مع رفض أي traversal خارج الجذر.

## الحدود الافتراضية

`STORAGE_DIR=./var/storage` (مستثنى من Git) و`STORAGE_MAX_FILE_BYTES=5242880`
(5MB، بحد أعلى 50MB). الصور: JPEG وPNG وWebP. الوثائق: الصور السابقة مع PDF.
تجاوز الحجم يرد 413 `FILE_TOO_LARGE`، والصيغة المرفوضة 415 `UNSUPPORTED_FILE_TYPE`،
وغياب الملف 400 `FILE_REQUIRED`. حد المعرض 20 صورة للخبيرة (`409 MEDIA_LIMIT_REACHED`).

## المسارات (كلها تحت `/api/v1`، والتفاصيل في `openapi.yaml`)

| المسار | الطلب/الوظيفة |
| --- | --- |
| `POST /experts/me/portfolio` | multipart بحقل `image` و`serviceId` الاختياري (يجب أن تكون الخدمة للخبيرة نفسها)؛ يعيد `{id, serviceId, sortOrder, url}` دون مفتاح التخزين |
| `DELETE /experts/me/portfolio/:id` | حذف الصف ثم الكائن (204)؛ ملكية الجلسة فقط |
| `GET /experts/:id/portfolio` | قائمة عامة لخبيرة قابلة للاكتشاف (المعتمدة الظاهرة)؛ غيرها 404 دون كشف الوجود |
| `GET /portfolio/:id/file` | بايتات الصورة بنفس قاعدة الظهور، مع `Cache-Control: private` |
| `POST /experts/me/identity-document` | multipart بحقل `document`؛ الاستبدال يحذف الكائن السابق، والمفتاح لا يظهر في أي استجابة |
| `GET /experts/me/identity-document/file` | تنزيل المالكة لوثيقتها |
| `GET /admin/experts/:id/identity-document/file` | تنزيل المدير للمراجعة؛ لا روابط عامة لوثائق الهوية أبدًا |

- كتابة الصف وحفظ الكائن مرتبطان بتعويض: فشل الإدخال بعد الحفظ يحذف الكائن، وفشل الحفظ يمنع الإدخال. الأيتام المحتملة عند التعطل خارج النطاق الحالي.
- لا تُسجل أسماء الملفات الأصلية أو المحتوى في logs؛ سجلات التشغيل أعداد وأكواد فقط.

## المتبقي

مزود إنتاج خارجي، إعادة ترتيب صور المعرض، وفحص محتوى/أبعاد الصور قبل القبول.
