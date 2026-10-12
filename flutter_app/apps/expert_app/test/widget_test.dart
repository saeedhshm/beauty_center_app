import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_expert/src/app.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('expert foundation is Arabic RTL and role-specific', (
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
        child: const ExpertApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('تطبيق الخبيرة'), findsOneWidget);
    expect(find.text('مساحتكِ المهنية، بهدوء ووضوح'), findsOneWidget);
    expect(find.textContaining('هوية منفصلة لتطبيق الخبيرة'), findsOneWidget);
    final direction = tester.widget<Directionality>(
      find.byType(Directionality).first,
    );
    expect(direction.textDirection, TextDirection.rtl);
  });
}
