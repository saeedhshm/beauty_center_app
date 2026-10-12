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
