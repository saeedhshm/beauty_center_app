import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/earnings_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('summary mirrors server totals exactly', (tester) async {
    final gateway = _EarningGateway();
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    expect(find.text('240.40 EGP'), findsWidgets);
    expect(find.text('100.00 EGP'), findsOneWidget);
    expect(find.text('مؤهل الآن'), findsOneWidget);
    expect(find.text('مسجل'), findsWidgets);
    expect(find.text('محول'), findsWidgets);
  });

  testWidgets('transfers open linked bookings read-only', (tester) async {
    final gateway = _EarningGateway();
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    expect(find.textContaining('إجراء إداري'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('payout-p1')));
    await tester.pumpAndSettle();

    expect(find.text('240.40 EGP'), findsWidgets);
    expect(find.textContaining('الحجوزات المرتبطة'), findsOneWidget);
    expect(find.text('240.40 EGP', skipOffstage: false), findsWidgets);
  });

  testWidgets('filter chips refetch from the server', (tester) async {
    final gateway = _EarningGateway();
    await tester.pumpWidget(_app(ExpertEarningsScreen(earnings: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('transfers-filter-recorded')));
    await tester.pumpAndSettle();

    expect(gateway.filters, contains(false));
    expect(find.text('مسجل'), findsWidgets);
  });
}

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

class _EarningGateway implements EarningGateway {
  final filters = <bool?>[];

  @override
  Future<EarningsSummary> earnings() async => EarningsSummary.fromJson({
    'eligible': [
      {'currency': 'EGP', 'amount': '240.40'},
    ],
    'recorded': [
      {'currency': 'EGP', 'amount': '100.00'},
    ],
    'transferred': [
      {'currency': 'EGP', 'amount': '50.00'},
    ],
  });

  @override
  Future<CatalogPage<ExpertPayout>> payouts({
    bool? transferred,
    int page = 1,
  }) async {
    filters.add(transferred);
    return CatalogPage(
      items: [
        ExpertPayout.fromJson({
          'id': 'p1',
          'amount': '240.40',
          'currency': 'EGP',
          'transferRef': null,
          'transferredAt': null,
          'createdAt': '2026-10-14T06:00:00.000Z',
        }),
      ],
      page: 1,
      limit: 20,
      hasNext: false,
    );
  }

  @override
  Future<ExpertPayout> payout(String id) async => ExpertPayout.fromJson({
    'id': id,
    'amount': '240.40',
    'currency': 'EGP',
    'transferRef': null,
    'transferredAt': null,
    'createdAt': '2026-10-14T06:00:00.000Z',
    'bookings': [
      {
        'id': 'b1',
        'status': 'completed',
        'startsAt': '2026-10-20T07:00:00.000Z',
        'endsAt': '2026-10-20T08:00:00.000Z',
        'timeZone': 'Africa/Cairo',
        'totalAmount': '300.50',
        'expertEarning': '240.40',
        'currency': 'EGP',
      },
    ],
  });
}
