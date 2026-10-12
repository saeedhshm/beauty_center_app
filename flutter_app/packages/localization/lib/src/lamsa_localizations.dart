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
      ? 'ستتوفر إدارة الخدمات والمواعيد في المراحل التالية.'
      : 'Services and scheduling will be available in later phases.';
  String get suspendedAccount =>
      isArabic ? 'الحساب معلّق' : 'Account suspended';
  String get suspendedAccountMessage => isArabic
      ? 'لا يمكنكِ استخدام وظائف العمل حاليًا. يمكنكِ تحديث الملف أو التواصل مع الإدارة.'
      : 'Work features are unavailable. You can update your profile or contact administration.';
  String get noCities => isArabic
      ? 'لا توجد مدينة إطلاق مفعلة حاليًا'
      : 'No active launch city is available';
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
