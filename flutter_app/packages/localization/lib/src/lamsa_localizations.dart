import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

class LamsaLocalizations {
  const LamsaLocalizations(this.locale);

  final Locale locale;

  static const supportedLocales = [Locale('ar'), Locale('en')];
  static const localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    _LamsaLocalizationsDelegate(),
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ];

  static LamsaLocalizations of(BuildContext context) {
    return Localizations.of<LamsaLocalizations>(context, LamsaLocalizations)!;
  }

  bool get isArabic => locale.languageCode == 'ar';
  String get appName => isArabic ? 'لمسة' : 'Lamsa';
  String get customerApp => isArabic ? 'تطبيق العميلة' : 'Customer app';
  String get expertApp => isArabic ? 'تطبيق الخبيرة' : 'Expert app';
  String get customerFoundationTitle => isArabic
      ? 'جمالكِ يبدأ من اختيار موثوق'
      : 'Beauty starts with a trusted choice';
  String get customerFoundationMessage => isArabic
      ? 'أعددنا الأساس لتجربة حجز منزلية بسيطة وآمنة في القاهرة.'
      : 'The foundation is ready for a simple and safe home-booking experience in Cairo.';
  String get expertFoundationTitle => isArabic
      ? 'مساحتكِ المهنية، بهدوء ووضوح'
      : 'Your professional space, calm and clear';
  String get expertFoundationMessage => isArabic
      ? 'أساس موحد يساعدكِ لاحقًا على إدارة ملفكِ ومواعيدكِ وطلباتكِ.'
      : 'A shared foundation for managing your profile, schedule, and requests later.';
  String get retry => isArabic ? 'إعادة المحاولة' : 'Retry';
  String get login => isArabic ? 'تسجيل الدخول' : 'Sign in';
  String get createAccount => isArabic ? 'إنشاء حساب' : 'Create account';
  String get welcomeBack => isArabic ? 'مرحبًا بعودتكِ' : 'Welcome back';
  String get phone => isArabic ? 'رقم الهاتف' : 'Phone number';
  String get password => isArabic ? 'كلمة المرور' : 'Password';
  String get newPassword => isArabic ? 'كلمة المرور الجديدة' : 'New password';
  String get name => isArabic ? 'الاسم' : 'Name';
  String get forgotPassword =>
      isArabic ? 'نسيت كلمة المرور' : 'Forgot password';
  String get noAccount => isArabic ? 'ليس لديكِ حساب؟' : 'No account yet?';
  String get haveAccount =>
      isArabic ? 'لديكِ حساب بالفعل؟' : 'Already have an account?';
  String get continueLabel => isArabic ? 'متابعة' : 'Continue';
  String get verificationCode => isArabic ? 'رمز التحقق' : 'Verification code';
  String get verifyAndCreate =>
      isArabic ? 'تحقق وإنشاء الحساب' : 'Verify and create account';
  String get resetPassword =>
      isArabic ? 'استعادة كلمة المرور' : 'Reset password';
  String get confirmReset => isArabic ? 'تعيين كلمة المرور' : 'Set password';
  String get backToLogin => isArabic ? 'العودة إلى الدخول' : 'Back to sign in';
  String get demoOtpHint => isArabic
      ? 'وضع العرض: رمز التحقق 123456'
      : 'Demo mode: verification code is 123456';
  String get requiredField =>
      isArabic ? 'هذا الحقل مطلوب' : 'This field is required';
  String get invalidPhone => isArabic
      ? 'أدخلي رقم محمول مصريًا صحيحًا'
      : 'Enter a valid Egyptian mobile number';
  String get passwordLength => isArabic
      ? 'كلمة المرور يجب ألا تقل عن 12 حرفًا'
      : 'Password must be at least 12 characters';
  String get invalidOtp =>
      isArabic ? 'أدخلي رمزًا من 6 أرقام' : 'Enter the 6-digit code';
  String get invalidName => isArabic
      ? 'الاسم يجب ألا يقل عن حرفين'
      : 'Name must be at least 2 characters';
  String get account => isArabic ? 'الحساب' : 'Account';
  String get profile => isArabic ? 'الملف الشخصي' : 'Profile';
  String get save => isArabic ? 'حفظ التغييرات' : 'Save changes';
  String get logout => isArabic ? 'تسجيل الخروج' : 'Sign out';
  String get sessionExpired => isArabic
      ? 'انتهت الجلسة، سجلي الدخول مجددًا'
      : 'Your session expired. Sign in again.';
  String get customerWrongRole => isArabic
      ? 'هذا الحساب مخصص لتطبيق الخبيرة'
      : 'This account belongs in the expert app.';
  String get expertWrongRole => isArabic
      ? 'هذا الحساب مخصص لتطبيق العميلة'
      : 'This account belongs in the customer app.';
  String get offlineRestoreTitle =>
      isArabic ? 'تعذر استعادة الجلسة' : 'Could not restore session';
  String get offlineRestoreMessage => isArabic
      ? 'احتفظنا بالجلسة المشفرة. تحققي من الاتصال ثم أعيدي المحاولة.'
      : 'Your encrypted session is preserved. Check the connection and retry.';
  String get useAnotherAccount =>
      isArabic ? 'استخدام حساب آخر' : 'Use another account';
  String get loadingSession => isArabic
      ? 'جاري استعادة جلستكِ بأمان'
      : 'Restoring your session securely';
  String get profileUpdated => isArabic ? 'تم حفظ الملف' : 'Profile saved';
  String get passwordResetDone => isArabic
      ? 'تم تغيير كلمة المرور. يمكنكِ تسجيل الدخول الآن.'
      : 'Password changed. You can sign in now.';
  String get expertProfile => isArabic ? 'ملف الخبيرة' : 'Expert profile';
  String get bio => isArabic ? 'نبذة مهنية' : 'Professional bio';
  String get city => isArabic ? 'المدينة' : 'City';
  String get identityDocument =>
      isArabic ? 'وثيقة الهوية' : 'Identity document';
  String get chooseDocument =>
      isArabic ? 'اختيار ورفع الوثيقة' : 'Choose and upload document';
  String get replaceDocumentHint => isArabic
      ? 'يمكن رفع أو استبدال JPG أو PNG أو WebP أو PDF حتى 5MB.'
      : 'Upload or replace a JPG, PNG, WebP, or PDF up to 5MB.';
  String get documentUploaded => isArabic
      ? 'تم رفع الوثيقة لهذه الجلسة'
      : 'Document uploaded in this session';
  String get pendingApproval =>
      isArabic ? 'ملفكِ قيد مراجعة الإدارة' : 'Your profile is under review';
  String get pendingApprovalMessage => isArabic
      ? 'يمكنكِ استكمال بياناتكِ أو استبدال الوثيقة أثناء الانتظار.'
      : 'You can complete your profile or replace the document while waiting.';
  String get approvedAccount =>
      isArabic ? 'تم اعتماد حسابكِ' : 'Your account is approved';
  String get approvedAccountMessage => isArabic
      ? 'يمكنكِ الآن إدارة خدماتكِ ومعرض أعمالكِ.'
      : 'You can now manage your services and portfolio.';
  String get suspendedAccount =>
      isArabic ? 'الحساب معلّق' : 'Account suspended';
  String get suspendedAccountMessage => isArabic
      ? 'لا يمكنكِ استخدام وظائف العمل حاليًا. يمكنكِ تحديث الملف أو التواصل مع الإدارة.'
      : 'Work features are unavailable. You can update your profile or contact administration.';
  String get noCities => isArabic
      ? 'لا توجد مدينة إطلاق مفعلة حاليًا'
      : 'No active launch city is available';
  String get catalog => isArabic ? 'اكتشفي' : 'Discover';
  String get addresses => isArabic ? 'العناوين' : 'Addresses';
  String get loadingCatalog =>
      isArabic ? 'جاري تحميل الكتالوج' : 'Loading catalog';
  String get loadingCatalogMessage => isArabic
      ? 'نجهز لكِ الخدمات والخبيرات المتاحات.'
      : 'Preparing available services and experts.';
  String get noCitiesMessage => isArabic
      ? 'لا توجد مدن نشطة متاحة حاليًا.'
      : 'No active cities are currently available.';
  String get noExperts => isArabic ? 'لا توجد خبيرات' : 'No experts found';
  String get noExpertsMessage => isArabic
      ? 'غيّري البحث أو الخدمة المختارة وحاولي مرة أخرى.'
      : 'Change the search or selected service and try again.';
  String get loadMore => isArabic ? 'عرض المزيد' : 'Load more';
  String get searchExperts =>
      isArabic ? 'ابحثي باسم الخبيرة' : 'Search experts by name';
  String get search => isArabic ? 'بحث' : 'Search';
  String get service => isArabic ? 'الخدمة' : 'Service';
  String get allServices => isArabic ? 'كل الخدمات' : 'All services';
  String get sortExperts => isArabic ? 'ترتيب الخبيرات' : 'Sort experts';
  String get sortNameAsc => isArabic ? 'الاسم: أ إلى ي' : 'Name: A to Z';
  String get sortNameDesc => isArabic ? 'الاسم: ي إلى أ' : 'Name: Z to A';
  String get sortRatingDesc =>
      isArabic ? 'التقييم: الأعلى أولًا' : 'Rating: highest first';
  String get sortPriceAsc =>
      isArabic ? 'السعر: الأقل أولًا' : 'Price: lowest first';
  String get sortPriceDesc =>
      isArabic ? 'السعر: الأعلى أولًا' : 'Price: highest first';
  String get loadingExpert =>
      isArabic ? 'جاري تحميل ملف الخبيرة' : 'Loading expert profile';
  String get loadingExpertMessage => isArabic
      ? 'نقرأ الخدمات والأسعار والتقييمات.'
      : 'Loading services, prices, and reviews.';
  String get services => isArabic ? 'الخدمات' : 'Services';
  String get portfolio => isArabic ? 'معرض الأعمال' : 'Portfolio';
  String get noPortfolio =>
      isArabic ? 'لا توجد صور في المعرض' : 'No portfolio images';
  String get reviews => isArabic ? 'التقييمات' : 'Reviews';
  String get noReviews => isArabic ? 'لا توجد تقييمات بعد' : 'No reviews yet';
  String get loadMoreReviews =>
      isArabic ? 'عرض تقييمات أخرى' : 'Load more reviews';
  String get imageLoadFailed =>
      isArabic ? 'تعذر تحميل الصورة' : 'Image could not be loaded';
  String get forbiddenTitle => isArabic ? 'غير مسموح' : 'Access denied';
  String get requestFailed => isArabic ? 'تعذر تنفيذ الطلب' : 'Request failed';
  String get unexpectedError =>
      isArabic ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred';
  String get addAddress => isArabic ? 'إضافة عنوان' : 'Add address';
  String get loadingAddresses =>
      isArabic ? 'جاري تحميل العناوين' : 'Loading addresses';
  String get loadingAddressesMessage => isArabic
      ? 'نقرأ عناوينكِ المحفوظة بأمان.'
      : 'Loading your saved addresses securely.';
  String get noAddresses =>
      isArabic ? 'لا توجد عناوين محفوظة' : 'No saved addresses';
  String get noAddressesMessage => isArabic
      ? 'أضيفي عنوانًا لاستخدامه لاحقًا في الحجز.'
      : 'Add an address to use for a future booking.';
  String get defaultAddress =>
      isArabic ? 'العنوان الافتراضي' : 'Default address';
  String get makeDefault => isArabic ? 'تعيين كافتراضي' : 'Make default';
  String get edit => isArabic ? 'تعديل' : 'Edit';
  String get delete => isArabic ? 'حذف' : 'Delete';
  String get defaultAddressUpdated =>
      isArabic ? 'تم تحديث العنوان الافتراضي' : 'Default address updated';
  String get deleteAddressTitle =>
      isArabic ? 'حذف العنوان؟' : 'Delete address?';
  String get cancel => isArabic ? 'إلغاء' : 'Cancel';
  String get addressDeleted => isArabic ? 'تم حذف العنوان' : 'Address deleted';
  String get editAddress => isArabic ? 'تعديل العنوان' : 'Edit address';
  String get addressLabel => isArabic ? 'اسم العنوان' : 'Address label';
  String get addressText =>
      isArabic ? 'وصف العنوان بالتفصيل' : 'Full address description';
  String get addressLocation => isArabic ? 'موقع العنوان' : 'Address location';
  String get locationRequiredMessage => isArabic
      ? 'حددي موقع العنوان على الخريطة.'
      : 'Select the address location on the map.';
  String get locationRequiredValidation =>
      isArabic ? 'يلزم تحديد موقع العنوان.' : 'Address location is required.';
  String get chooseLocation =>
      isArabic ? 'اختيار الموقع على الخريطة' : 'Choose on map';
  String get locationUnavailableTitle =>
      isArabic ? 'الخريطة غير متاحة' : 'Map unavailable';
  String get locationUnavailableMessage => isArabic
      ? 'لم تُهيأ حدود هذه المدينة بعد. اختاري مدينة أخرى أو حاولي لاحقًا.'
      : 'This city boundary is not configured yet. Choose another city or try again later.';
  String get locationPickerInstructions => isArabic
      ? 'حرّكي الخريطة أو اضغطي لاختيار موقع العنوان داخل حدود المدينة.'
      : 'Move the map or tap to select the address location within the city bounds.';
  String get confirmLocation => isArabic ? 'تأكيد الموقع' : 'Confirm location';
  String get openStreetMapContributors =>
      isArabic ? '© مساهمو OpenStreetMap' : '© OpenStreetMap contributors';
  String get optionalCoordinatesTitle =>
      isArabic ? 'الإحداثيات (اختيارية)' : 'Coordinates (optional)';
  String get optionalCoordinatesMessage => isArabic
      ? 'أدخلي خط العرض والطول معًا. الإحداثيات لا تثبت أن العنوان داخل حدود المدينة.'
      : 'Enter latitude and longitude together. Coordinates do not prove the address is within city boundaries.';
  String get latitude => isArabic ? 'خط العرض' : 'Latitude';
  String get longitude => isArabic ? 'خط الطول' : 'Longitude';
  String get addressLabelValidation => isArabic
      ? 'اسم العنوان مطلوب وبحد أقصى 100 حرف.'
      : 'Address label is required and must be at most 100 characters.';
  String get addressTextValidation => isArabic
      ? 'وصف العنوان يجب أن يكون بين 5 و1000 حرف.'
      : 'Address description must be between 5 and 1000 characters.';
  String get coordinatesPairValidation => isArabic
      ? 'أدخلي خط العرض والطول معًا أو اتركيهما فارغين.'
      : 'Enter both latitude and longitude or leave both empty.';
  String ratingSummary(String ratingAvg, int ratingCount) => isArabic
      ? '$ratingAvg من 5 ($ratingCount تقييم)'
      : '$ratingAvg out of 5 ($ratingCount reviews)';
  String cityValue(String city) => isArabic ? 'المدينة: $city' : 'City: $city';
  String serviceDuration(int durationMin) =>
      isArabic ? '$durationMin دقيقة' : '$durationMin min';
  String reviewHeading(String reviewerName, int rating) => isArabic
      ? '$reviewerName - $rating من 5'
      : '$reviewerName - $rating out of 5';
  String deleteAddressMessage(String label) => isArabic
      ? 'سيتم حذف عنوان "$label" نهائيًا.'
      : 'The address "$label" will be permanently deleted.';
  String coordinateRangeValidation(double min, double max) => isArabic
      ? 'يجب أن تكون القيمة بين $min و$max.'
      : 'Value must be between $min and $max.';
  String get acceptingBookings =>
      isArabic ? 'استقبال الطلبات' : 'Accept bookings';
  String get acceptingBookingsHint => isArabic
      ? 'عند التفعيل يمكن للعميلات العثور على ملفكِ المؤهل.'
      : 'When enabled, customers can find your eligible profile.';
  String get acceptingBookingsUpdated =>
      isArabic ? 'تم تحديث استقبال الطلبات' : 'Booking intake updated';
  String get activateOffer => isArabic ? 'تفعيل الخدمة' : 'Activate service';
  String get addFirstService =>
      isArabic ? 'أضيفي خدمتكِ الأولى' : 'Add your first service';
  String get addPortfolioImage => isArabic ? 'إضافة صورة' : 'Add image';
  String get addService => isArabic ? 'إضافة خدمة' : 'Add service';
  String get approvalRequiredToAcceptBookings => isArabic
      ? 'يلزم اعتماد الحساب قبل استقبال الطلبات.'
      : 'Account approval is required before accepting bookings.';
  String get approvedAccountWorkspaceMessage => isArabic
      ? 'حسابكِ معتمد ويمكنكِ إدارة الخدمات والمعرض واستقبال الطلبات.'
      : 'Your account is approved. You can manage services, portfolio, and booking intake.';
  String get associateServiceOptional =>
      isArabic ? 'ربط بخدمة (اختياري)' : 'Link to service (optional)';
  String get availableGlobalServices =>
      isArabic ? 'الخدمات المتاحة للإضافة' : 'Services available to add';
  String get changePrice => isArabic ? 'تغيير السعر' : 'Change price';
  String get deactivateOffer =>
      isArabic ? 'إيقاف الخدمة' : 'Deactivate service';
  String get deleteFailed => isArabic ? 'تعذر الحذف' : 'Delete failed';
  String get deleteImage => isArabic ? 'حذف الصورة' : 'Delete image';
  String get deletePortfolioImageMessage => isArabic
      ? 'سيتم حذف الصورة من معرض أعمالكِ.'
      : 'This image will be removed from your portfolio.';
  String get deletePortfolioImageTitle =>
      isArabic ? 'حذف صورة المعرض؟' : 'Delete portfolio image?';
  String get emptyPortfolio =>
      isArabic ? 'معرضكِ فارغ' : 'Your portfolio is empty';
  String get emptyPortfolioHint => isArabic
      ? 'أضيفي صورًا حقيقية لأعمالكِ حتى 20 صورة.'
      : 'Add real examples of your work, up to 20 images.';
  String get expertWorkspace => isArabic ? 'مساحة الخبيرة' : 'Expert workspace';
  String get fileReadFailed =>
      isArabic ? 'تعذر قراءة الملف' : 'Could not read file';
  String get fileTooLarge5MiB =>
      isArabic ? 'حجم الملف يتجاوز 5MB' : 'File exceeds 5 MiB';
  String get fileUploadFailed =>
      isArabic ? 'تعذر رفع الملف' : 'File upload failed';
  String get globalServiceActive =>
      isArabic ? 'الخدمة متاحة' : 'Service available';
  String get globalServiceInactive =>
      isArabic ? 'الخدمة العامة متوقفة' : 'Global service inactive';
  String get globalServiceInactiveHint => isArabic
      ? 'لا يمكن تفعيل العرض حتى تعيد الإدارة تفعيل الخدمة.'
      : 'The offer cannot be activated until administration enables the service.';
  String get invalidPrice => isArabic
      ? 'أدخلي سعرًا صحيحًا حتى 8 أرقام ومنزلتين عشريتين.'
      : 'Enter a valid price with up to 8 digits and 2 decimals.';
  String get loadingPortfolio =>
      isArabic ? 'جاري تحميل المعرض' : 'Loading portfolio';
  String get loadingServices =>
      isArabic ? 'جاري تحميل الخدمات' : 'Loading services';
  String get noAssociatedService =>
      isArabic ? 'دون خدمة محددة' : 'No linked service';
  String get noExpertServices =>
      isArabic ? 'لا توجد خدمات مضافة' : 'No services added';
  String get noServicesToAdd =>
      isArabic ? 'لا توجد خدمات أخرى للإضافة' : 'No more services to add';
  String get offerActive => isArabic ? 'العرض نشط' : 'Offer active';
  String get offerInactive => isArabic ? 'العرض متوقف' : 'Offer inactive';
  String get portfolioLimitReached =>
      isArabic ? 'وصلتِ إلى حد 20 صورة' : 'You reached the 20-image limit';
  String get portfolioLoadFailed =>
      isArabic ? 'تعذر تحميل المعرض' : 'Could not load portfolio';
  String get portfolioUploadHint => isArabic
      ? 'JPG أو PNG أو WebP حتى 5MB للصورة.'
      : 'JPG, PNG, or WebP up to 5 MiB per image.';
  String get priceDecimalLabel => isArabic ? 'السعر' : 'Price';
  String get profileLoadFailed =>
      isArabic ? 'تعذر تحميل الملف' : 'Could not load profile';
  String get servicePrice => isArabic ? 'سعر الخدمة' : 'Service price';
  String get serviceSaved => isArabic ? 'تم حفظ الخدمة' : 'Service saved';
  String get servicesAndPrices =>
      isArabic ? 'الخدمات والأسعار' : 'Services and prices';
  String get servicesLoadFailed =>
      isArabic ? 'تعذر تحميل الخدمات' : 'Could not load services';
  String get servicesMoneyHint => isArabic
      ? 'العملة يحددها السوق، ولن يجري التطبيق أي تحويل.'
      : 'Currency is set by the market; the app performs no conversion.';
  String get tryAgain => isArabic ? 'حاولي مرة أخرى' : 'Try again';
  String get unavailableService =>
      isArabic ? 'خدمة غير متاحة' : 'Unavailable service';
  String get unsupportedFileType =>
      isArabic ? 'نوع الملف غير مدعوم' : 'Unsupported file type';
  String get unsupportedPortfolioFileType => isArabic
      ? 'اختاري صورة JPG أو PNG أو WebP.'
      : 'Choose a JPG, PNG, or WebP image.';
  String get updateFailed => isArabic ? 'تعذر حفظ التحديث' : 'Update failed';
  String portfolioCount(int current, int maximum) =>
      isArabic ? '$current من $maximum صورة' : '$current of $maximum images';
  String priceWithCurrency(String price, String currency) => '$price $currency';
  String serviceDurationMinutes(int minutes) =>
      isArabic ? '$minutes دقيقة' : '$minutes minutes';
}

class _LamsaLocalizationsDelegate
    extends LocalizationsDelegate<LamsaLocalizations> {
  const _LamsaLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => LamsaLocalizations.supportedLocales.any(
    (item) => item.languageCode == locale.languageCode,
  );

  @override
  Future<LamsaLocalizations> load(Locale locale) =>
      SynchronousFuture(LamsaLocalizations(locale));

  @override
  bool shouldReload(_LamsaLocalizationsDelegate old) => false;
}

extension LamsaLocalizationsContext on BuildContext {
  LamsaLocalizations get lamsa => LamsaLocalizations.of(this);
}
