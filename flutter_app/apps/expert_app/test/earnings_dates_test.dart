import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/earnings_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

/// Payout dates in the expert earnings UI.
///
/// The contract currently sends no payout period (`web_app/backend/src/modules/payouts`),
/// so the period row must say so rather than invent one. Recorded and executed
/// are separate facts and are shown as such.
void main() {
  testWidgets('a recorded payout shows its registration date only', (
    tester,
  ) async {
    final gateway = _Gateway(
      payout: _payoutJson(
        id: 'p1',
        transferRef: null,
        transferredAt: null,
        createdAt: '2026-10-14T06:00:00.000Z',
      ),
    );
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-p1')), findsOneWidget);
    // 06:00Z is 09:00 in Cairo (Egypt is on DST in mid-October), and the
    // device timezone is never used.
    expect(
      find.textContaining('تاريخ التسجيل: الأربعاء، 14 أكتوبر 2026، 09:00'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('payout-p1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-recorded-at')), findsOneWidget);
    expect(find.textContaining('14 أكتوبر 2026، 09:00'), findsWidgets);
    expect(
      find.byKey(const ValueKey('payout-not-transferred')),
      findsOneWidget,
    );
    expect(
      find.textContaining('لم يُسجَّل تنفيذ التحويل بعد.'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('payout-transferred-at')), findsNothing);
    expect(find.byKey(const ValueKey('payout-transfer-ref')), findsNothing);
  });

  testWidgets('an executed payout shows the transfer date and reference', (
    tester,
  ) async {
    final gateway = _Gateway(
      payout: _payoutJson(
        id: 'p2',
        transferRef: 'TRF-77',
        transferredAt: '2026-10-16T09:30:00.000Z',
        createdAt: '2026-10-14T06:00:00.000Z',
      ),
    );
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('payout-p2')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-transferred-at')), findsOneWidget);
    // Shown twice on purpose: the list row and the detail sheet.
    expect(
      find.textContaining('تاريخ التحويل: الجمعة، 16 أكتوبر 2026، 12:30'),
      findsNWidgets(2),
    );
    expect(find.byKey(const ValueKey('payout-transfer-ref')), findsOneWidget);
    expect(find.textContaining('TRF-77'), findsOneWidget);
    // The registration date stays visible next to the transfer date.
    expect(find.byKey(const ValueKey('payout-recorded-at')), findsOneWidget);
    expect(find.byKey(const ValueKey('payout-not-transferred')), findsNothing);
  });

  testWidgets('a missing payout period is stated, never invented', (
    tester,
  ) async {
    final gateway = _Gateway(payout: _payoutJson(id: 'p3'));
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('payout-p3')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-period')), findsNothing);
    expect(find.byKey(const ValueKey('payout-period-missing')), findsOneWidget);
    expect(find.textContaining('الخادم لا يوفّر فترة للتحويل'), findsOneWidget);
  });

  testWidgets('a payout period is displayed when the server sends one', (
    tester,
  ) async {
    final gateway = _Gateway(
      payout: {
        ..._payoutJson(id: 'p4'),
        'periodStart': '2026-10-01T00:00:00.000Z',
        'periodEnd': '2026-10-31T23:59:59.000Z',
      },
    );
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('payout-p4')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-period')), findsOneWidget);
    expect(find.byKey(const ValueKey('payout-period-missing')), findsNothing);
    expect(find.textContaining('فترة التحويل'), findsOneWidget);
    expect(find.textContaining('1 أكتوبر 2026'), findsOneWidget);
    // Egypt leaves DST at the end of October, so the period ends in November.
    expect(find.textContaining('1 نوفمبر 2026'), findsOneWidget);
  });
}

Map<String, Object?> _payoutJson({
  required String id,
  Object? transferRef,
  Object? transferredAt,
  String createdAt = '2026-10-14T06:00:00.000Z',
}) => {
  'id': id,
  'amount': '240.40',
  'currency': 'EGP',
  'transferRef': transferRef,
  'transferredAt': transferredAt,
  'createdAt': createdAt,
};

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

class _Gateway implements EarningGateway {
  _Gateway({required Map<String, Object?> payout}) : _payout = payout;

  final Map<String, Object?> _payout;

  @override
  Future<EarningsSummary> earnings() async => EarningsSummary.fromJson({
    'eligible': [
      {'currency': 'EGP', 'amount': '240.40'},
    ],
    'recorded': [
      {'currency': 'EGP', 'amount': '100.00'},
    ],
    'transferred': const <Object?>[],
  });

  @override
  Future<CatalogPage<ExpertPayout>> payouts({
    bool? transferred,
    int page = 1,
  }) async => CatalogPage(
    items: [ExpertPayout.fromJson(_payout)],
    page: 1,
    limit: 20,
    hasNext: false,
  );

  @override
  Future<ExpertPayout> payout(String id) async =>
      ExpertPayout.fromJson(_payout);
}
