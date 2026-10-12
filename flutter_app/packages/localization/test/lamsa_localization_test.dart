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
}
