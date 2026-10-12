import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_customer/src/app.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('customer foundation is Arabic RTL without business fixtures', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(
              environment: AppEnvironment.development,
              apiBaseUrl: 'http://127.0.0.1:3000',
            ),
          ),
          networkStateProvider.overrideWith((ref) => Stream.value(true)),
        ],
        child: const CustomerApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('تطبيق العميلة'), findsOneWidget);
    expect(find.text('جمالكِ يبدأ من اختيار موثوق'), findsOneWidget);
    expect(
      find.textContaining('تسجيل الدخول والرحلات التشغيلية'),
      findsOneWidget,
    );
    expect(find.textContaining('حجز تجريبي'), findsNothing);
    final direction = tester.widget<Directionality>(
      find.byType(Directionality).first,
    );
    expect(direction.textDirection, TextDirection.rtl);
  });

  testWidgets('customer app shows the shared offline banner', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(
              environment: AppEnvironment.development,
              apiBaseUrl: 'http://127.0.0.1:3000',
            ),
          ),
          networkStateProvider.overrideWith((ref) => Stream.value(false)),
        ],
        child: const CustomerApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('لا يوجد اتصال بالشبكة'), findsOneWidget);
  });
}
