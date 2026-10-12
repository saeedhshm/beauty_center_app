import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';

void main() {
  testWidgets('status view exposes retry and invokes it once', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: LamsaTheme.light(),
        home: LamsaStatusView(
          status: LamsaStatus.error,
          title: 'تعذر التحميل',
          message: 'حاول مرة أخرى',
          onRetry: () => retries += 1,
        ),
      ),
    );

    await tester.tap(find.text('إعادة المحاولة'));
    expect(retries, 1);
  });

  testWidgets('loading button prevents duplicate taps', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LamsaButton(
            label: 'حفظ',
            loading: true,
            onPressed: () => taps += 1,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(FilledButton));
    expect(taps, 0);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
