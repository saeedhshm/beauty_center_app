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
}
