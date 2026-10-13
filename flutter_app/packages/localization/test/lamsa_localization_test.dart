import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('loads centralized Arabic strings', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        home: Builder(builder: (context) => Text(context.lamsa.customerApp)),
      ),
    );

    expect(find.text('تطبيق العميلة'), findsOneWidget);
  });

  test('provides expert sort labels in Arabic and English', () {
    final arabic = LamsaLocalizations(const Locale('ar'));
    final english = LamsaLocalizations(const Locale('en'));

    expect(arabic.sortExperts, 'ترتيب الخبيرات');
    expect(arabic.sortPriceAsc, 'السعر: الأقل أولًا');
    expect(english.sortExperts, 'Sort experts');
    expect(english.sortRatingDesc, 'Rating: highest first');
  });

  test('provides ISO weekday names in Arabic and English', () {
    final arabic = LamsaLocalizations(const Locale('ar'));
    final english = LamsaLocalizations(const Locale('en'));

    expect(arabic.weekdayName(1), 'الإثنين');
    expect(arabic.weekdayName(7), 'الأحد');
    expect(english.weekdayName(1), 'Monday');
    expect(english.weekdayName(7), 'Sunday');
    expect(arabic.weekdayName(0), isEmpty);
    expect(arabic.appointmentSlots, 'المواعيد المتاحة');
    expect(english.noSlots, 'No slots');
  });
}
